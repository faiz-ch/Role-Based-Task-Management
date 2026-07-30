from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import os
import uuid

from app.core.deps import (
    get_current_user,
    can_view_subtask,
    can_manage_subtask,
    can_manage_task,
    can_create_subtask_in_task,
    is_task_lead,
    is_project_lead,
    has_permission,
    get_scoped_department_ids,
)
from app.database import get_db
from app.models.user import User
from app.models.task import Task
from app.models.project import Project
from app.models.subtask import SubTask, SubTaskAssignee
from app.models.report import Report
from app.models.attachment import Attachment
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.schemas.subtask import (
    SubtaskCreate,
    SubtaskUpdate,
    SubtaskStatusUpdate,
    SubtaskAssigneeUpdate,
    SubtaskOut,
)
from app.schemas.report import ReportCreate, ReportOut
from app.schemas.activity_log import ActivityLogOut
from app.schemas.comment import CommentCreate, CommentOut
from app.services.activity_log import log_activity
from app.services import notification_dispatch

router = APIRouter(prefix="/subtasks", tags=["subtasks"])
UPLOAD_DIR = "uploads"  # relative to backend/ — where uploaded files actually live on disk


async def _get_task_or_404_with_loads(db: AsyncSession, task_id: int) -> Task:
    """Load task with relationships needed for cascade authorization checks."""
    result = await db.execute(
        select(Task).options(
            selectinload(Task.project).selectinload(Project.departments),
            selectinload(Task.team_members),
        ).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def _get_subtask_or_404_with_loads(db: AsyncSession, subtask_id: int) -> SubTask:
    """Load subtask with relationships needed for cascade authorization checks."""
    result = await db.execute(
        select(SubTask).options(
            selectinload(SubTask.assignees),
            selectinload(SubTask.task).selectinload(Task.project).selectinload(Project.departments),
            selectinload(SubTask.task).selectinload(Task.team_members),
        ).where(SubTask.id == subtask_id)
    )
    subtask = result.scalar_one_or_none()
    if subtask is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    return subtask


def _subtask_to_out(subtask: SubTask) -> SubtaskOut:
    """Convert SubTask model to SubtaskOut schema."""
    return SubtaskOut(
        id=subtask.id,
        task_id=subtask.task_id,
        title=subtask.title,
        description=subtask.description,
        status=subtask.status,
        priority=subtask.priority,
        due_date=subtask.due_date,
        created_by=subtask.created_by,
        created_at=subtask.created_at,
        assignee_ids=[sa.user_id for sa in subtask.assignees],
    )


@router.post("/tasks/{task_id}/subtasks", response_model=SubtaskOut, status_code=201)
async def create_subtask(
    task_id: int,
    payload: SubtaskCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new subtask within a task. Only the task lead can create subtasks."""
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_create_subtask_in_task(current_user, task):
        raise HTTPException(status_code=403, detail="You can only create subtasks in tasks you lead")

    # Validate all requested assignee_ids are in the task's team members
    task_team_user_ids = {tm.user_id for tm in task.team_members}
    for assignee_id in payload.assignee_ids:
        if assignee_id not in task_team_user_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User {assignee_id} is not a member of this task's team"
            )

    # Create the subtask
    subtask = SubTask(
        task_id=task_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        created_by=current_user.id,
    )
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    await log_activity(db, current_user.id, "subtask_created", "subtask", subtask.id, detail=payload.title)
    await db.commit()

    # Insert assignee relationships
    for assignee_id in payload.assignee_ids:
        assignee = SubTaskAssignee(
            subtask_id=subtask.id,
            user_id=assignee_id,
            assigned_by=current_user.id,
        )
        db.add(assignee)

    await db.commit()
    await db.refresh(subtask)

    # Reload with assignees for response
    subtask_with_loads = await _get_subtask_or_404_with_loads(db, subtask.id)
    background_tasks.add_task(notification_dispatch.notify_subtask_assigned, subtask.id)
    return _subtask_to_out(subtask_with_loads)


@router.get("/tasks/{task_id}/subtasks", response_model=list[SubtaskOut])
async def list_subtasks_for_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List subtasks for a task with visibility filtering:
    - Task lead, project lead, and project:manage see all subtasks
    - Plain team members (not leads/managers) only see subtasks where they're an assignee
    """
    task = await _get_task_or_404_with_loads(db, task_id)

    # Load all subtasks for this task with assignees
    result = await db.execute(
        select(SubTask).options(
            selectinload(SubTask.assignees),
        ).where(SubTask.task_id == task_id)
    )
    subtasks = result.scalars().all()

    # Check if user has management authority (task lead, project lead, or project:manage)
    has_management_authority = can_manage_task(current_user, task)

    if has_management_authority:
        # Leads and managers see all subtasks they can view
        visible_subtasks = [s for s in subtasks if can_view_subtask(current_user, s)]
    else:
        # Plain team members only see subtasks where they're an assignee
        visible_subtasks = [
            s for s in subtasks
            if can_view_subtask(current_user, s) and any(sa.user_id == current_user.id for sa in s.assignees)
        ]

    return [_subtask_to_out(s) for s in visible_subtasks]


@router.get("/{subtask_id}", response_model=SubtaskOut)
async def get_subtask(
    subtask_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific subtask by ID."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    if not can_view_subtask(current_user, subtask):
        raise HTTPException(status_code=404, detail="Subtask not found")

    return _subtask_to_out(subtask)


@router.get("/{subtask_id}/activity", response_model=list[ActivityLogOut])
async def get_subtask_activity(
    subtask_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity log for a subtask. Uses same view permission as get_subtask."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    if not can_view_subtask(current_user, subtask):
        raise HTTPException(status_code=404, detail="Subtask not found")

    # Load activity logs for this subtask
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.entity_type == "subtask", ActivityLog.entity_id == subtask_id)
        .order_by(ActivityLog.created_at.desc())
    )
    logs = result.scalars().all()
    return logs


@router.get("/{subtask_id}/comments", response_model=list[CommentOut])
async def get_subtask_comments(
    subtask_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all comments for a subtask, ordered by created_at ascending (oldest first). Gated by can_view_subtask."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)
    if not can_view_subtask(current_user, subtask):
        raise HTTPException(status_code=404, detail="Subtask not found")

    result = await db.execute(
        select(Comment)
        .where(Comment.entity_type == "subtask", Comment.entity_id == subtask_id)
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()
    return comments


@router.patch("/{subtask_id}", response_model=SubtaskOut)
async def update_subtask(
    subtask_id: int,
    payload: SubtaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update subtask details. Assignees can update their own subtask's details, but not reassign."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    if not can_manage_subtask(current_user, subtask):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this subtask")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(subtask, field, value)

    await db.commit()
    await db.refresh(subtask)

    subtask_with_loads = await _get_subtask_or_404_with_loads(db, subtask.id)
    return _subtask_to_out(subtask_with_loads)


@router.patch("/{subtask_id}/status", response_model=SubtaskOut)
async def update_subtask_status(
    subtask_id: int,
    payload: SubtaskStatusUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update subtask status with explicit transition rules:
    - Submit (To Do/Reschedule -> Review): allowed for any user in subtask.assignees (regardless of other authority)
    - Approve (Review -> Done or Review -> Reschedule): allowed only for subtask.created_by
    - Manager override: can_manage_task() users who aren't the creator can still act, logged as override
    """
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    # Check if user is an assignee
    is_assignee = any(sa.user_id == current_user.id for sa in subtask.assignees)

    # Check if user is the creator
    is_creator = current_user.id == subtask.created_by

    # Check if user has management authority
    has_management_authority = can_manage_task(current_user, subtask.task)

    # Determine if this is a manager override (has authority but is not the creator)
    is_manager_override = has_management_authority and not is_creator

    # Handle submit transition (To Do/Reschedule -> Review)
    if subtask.status in ("To Do", "Reschedule") and payload.status == "Review":
        # Check for required report and attachment before allowing submission
        report_result = await db.execute(
            select(Report).where(Report.subtask_id == subtask_id)
        )
        has_report = report_result.scalar_one_or_none() is not None

        attachment_result = await db.execute(
            select(Attachment).where(Attachment.subtask_id == subtask_id)
        )
        has_attachment = attachment_result.scalar_one_or_none() is not None

        if not has_report and not has_attachment:
            raise HTTPException(
                status_code=400,
                detail="Cannot submit for review — both a report and an attachment are required before submitting."
            )
        elif not has_report:
            raise HTTPException(
                status_code=400,
                detail="Cannot submit for review — a report is required before submitting."
            )
        elif not has_attachment:
            raise HTTPException(
                status_code=400,
                detail="Cannot submit for review — an attachment is required before submitting."
            )

        if not is_assignee:
            if is_manager_override:
                print(f"status changed by non-owner {current_user.id} via manager override")
            else:
                raise HTTPException(
                    status_code=403,
                    detail="Only subtask assignees can submit it for review"
                )

    # Handle approve transitions (Review -> Done or Review -> Reschedule)
    elif subtask.status == "Review" and payload.status in ("Done", "Reschedule"):
        if not is_creator:
            if is_manager_override:
                print(f"status changed by non-owner {current_user.id} via manager override")
            else:
                raise HTTPException(
                    status_code=403,
                    detail="Only the subtask's creator can approve it or send it back"
                )

        # Require comment for approve/reschedule actions
        if not payload.comment or not payload.comment.strip():
            raise HTTPException(
                status_code=400,
                detail="A comment is required when approving or rescheduling a subtask."
            )

    # Reject any other transition
    else:
        valid_transitions = []
        if subtask.status in ("To Do", "Reschedule"):
            valid_transitions.append("Review (by assignee)")
        if subtask.status == "Review":
            valid_transitions.append("Done (by creator)")
            valid_transitions.append("Reschedule (by creator)")
        raise HTTPException(
            status_code=403,
            detail=f"Invalid transition. From {subtask.status}, valid transitions are: {', '.join(valid_transitions)}"
        )

    old_status = subtask.status
    subtask.status = payload.status
    # If transitioning to RESCHEDULE and a due_date is provided, update it
    if payload.status == "Reschedule" and payload.due_date is not None:
        subtask.due_date = payload.due_date

    # Create comment for approve/reschedule actions (Review -> Done or Review -> Reschedule)
    if old_status == "Review" and payload.status in ("Done", "Reschedule"):
        comment = Comment(
            author_id=current_user.id,
            entity_type="subtask",
            entity_id=subtask_id,
            content=payload.comment,
            action="approved" if payload.status == "Done" else "rescheduled",
        )
        db.add(comment)

    await log_activity(db, current_user.id, "subtask_status_changed", "subtask", subtask.id, detail=f"{old_status} -> {payload.status}")
    await db.commit()
    await db.refresh(subtask)

    # Send notifications based on status change
    if payload.status == "Review":
        background_tasks.add_task(notification_dispatch.notify_subtask_submitted_for_review, subtask.id)
    elif payload.status == "Reschedule":
        background_tasks.add_task(notification_dispatch.notify_subtask_rescheduled, subtask.id)
    elif payload.status == "Done":
        background_tasks.add_task(notification_dispatch.notify_subtask_done, subtask.id)

    subtask_with_loads = await _get_subtask_or_404_with_loads(db, subtask.id)
    return _subtask_to_out(subtask_with_loads)


@router.put("/{subtask_id}/assignees", response_model=SubtaskOut)
async def update_subtask_assignees(
    subtask_id: int,
    payload: SubtaskAssigneeUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update subtask assignees. Only the task lead can reassign people."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    if not is_task_lead(current_user, subtask.task):
        raise HTTPException(status_code=403, detail="Only the task lead can reassign subtasks")

    # Validate all requested user_ids are in the task's team members
    task_team_user_ids = {tm.user_id for tm in subtask.task.team_members}
    for user_id in payload.user_ids:
        if user_id not in task_team_user_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User {user_id} is not a member of this task's team"
            )

    # Delete existing assignees
    await db.execute(
        delete(SubTaskAssignee).where(SubTaskAssignee.subtask_id == subtask_id)
    )

    # Insert new assignees
    for user_id in payload.user_ids:
        assignee = SubTaskAssignee(
            subtask_id=subtask_id,
            user_id=user_id,
            assigned_by=current_user.id,
        )
        db.add(assignee)

    await db.commit()
    await db.refresh(subtask)

    background_tasks.add_task(notification_dispatch.notify_subtask_assigned, subtask.id)

    subtask_with_loads = await _get_subtask_or_404_with_loads(db, subtask.id)
    return _subtask_to_out(subtask_with_loads)


@router.delete("/{subtask_id}", status_code=204)
async def delete_subtask(
    subtask_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a subtask. Only task lead / project lead / manager cascade can delete."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    # Use can_manage_task (not can_manage_subtask) to prevent plain assignees from deleting
    from app.core.deps import can_manage_task
    if not can_manage_task(current_user, subtask.task):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this subtask")

    await db.delete(subtask)
    await db.commit()


@router.post("/{subtask_id}/reports", response_model=ReportOut, status_code=201)
async def create_subtask_report(
    subtask_id: int,
    payload: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a report for a subtask. Only subtask assignees can create reports."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    # Check if user is an assignee
    is_assignee = any(sa.user_id == current_user.id for sa in subtask.assignees)
    if not is_assignee:
        raise HTTPException(status_code=403, detail="Only subtask assignees can create reports")

    report = Report(
        subtask_id=subtask_id,
        content=payload.content,
        created_by=current_user.id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    # Load with author for response
    result = await db.execute(
        select(Report).options(selectinload(Report.author)).where(Report.id == report.id)
    )
    report_with_author = result.scalar_one_or_none()
    return _report_to_out(report_with_author)


@router.get("/{subtask_id}/reports", response_model=list[ReportOut])
async def list_subtask_reports(
    subtask_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reports for a subtask. Anyone who can view the subtask can view its reports."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    if not can_view_subtask(current_user, subtask):
        raise HTTPException(status_code=403, detail="You do not have permission to view this subtask")

    # Load reports with author, newest first
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.author))
        .where(Report.subtask_id == subtask_id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()

    return [_report_to_out(r) for r in reports]


def _report_to_out(report: Report) -> ReportOut:
    """Convert Report model to ReportOut schema."""
    return ReportOut(
        id=report.id,
        project_id=report.project_id,
        task_id=report.task_id,
        subtask_id=report.subtask_id,
        content=report.content,
        created_by=report.created_by,
        created_at=report.created_at,
    )


@router.post("/{subtask_id}/attachments", response_model=dict)
async def upload_subtask_attachment(
    subtask_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload an attachment for a subtask. Gated to subtask assignees OR task-lead/project-lead/manager level.
    Sets both task_id (subtask's parent task) and subtask_id.
    """
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    # Check if user is an assignee or has management authority
    is_assignee = any(sa.user_id == current_user.id for sa in subtask.assignees)
    has_management_authority = can_manage_task(current_user, subtask.task)

    if not is_assignee and not has_management_authority:
        raise HTTPException(status_code=403, detail="You do not have permission to upload attachments to this subtask")

    # Use the parent task's directory for storage
    task_id = subtask.task_id
    task_dir = os.path.join(UPLOAD_DIR, str(task_id))
    os.makedirs(task_dir, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{file.filename}"
    stored_path = os.path.join(task_dir, stored_name)

    content = await file.read()
    with open(stored_path, "wb") as f:
        f.write(content)

    attachment = Attachment(
        task_id=task_id,  # Parent task ID
        subtask_id=subtask_id,  # Subtask ID
        filename=file.filename,
        stored_path=stored_path,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "size_bytes": attachment.size_bytes,
        "content_type": attachment.content_type,
        "uploaded_at": attachment.uploaded_at,
    }


@router.get("/{subtask_id}/attachments", response_model=list[dict])
async def list_subtask_attachments(
    subtask_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all attachments for a subtask. Anyone who can view the subtask can view its attachments."""
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    if not can_view_subtask(current_user, subtask):
        raise HTTPException(status_code=403, detail="You do not have permission to view this subtask")

    result = await db.execute(
        select(Attachment).where(Attachment.subtask_id == subtask_id)
    )
    attachments = result.scalars().all()

    return [
        {
            "id": a.id,
            "filename": a.filename,
            "size_bytes": a.size_bytes,
            "content_type": a.content_type,
            "uploaded_at": a.uploaded_at,
            "uploaded_by": a.uploaded_by,
        }
        for a in attachments
    ]
