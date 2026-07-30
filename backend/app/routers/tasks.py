import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, Response
from app.services.conversion import convert_to_pdf
from app.services import notification_dispatch
from app.services.activity_log import log_activity
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user, has_permission, get_scoped_department_ids, can_view_task, can_manage_task, can_edit_delete_task, can_create_task_in_project, is_project_lead, is_task_lead
from app.database import get_db
from app.models.task import Task, TaskStatus, TaskTeam
from app.models.subtask import SubTask
from app.models.attachment import Attachment
from app.models.user import User
from app.models.project import Project
from app.models.report import Report
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskOut,
    TaskStatusUpdate,
    TaskAssignRequest,
    TaskTeamUpdate,
    AttachmentOut,
)
from app.schemas.report import ReportCreate, ReportOut
from app.schemas.activity_log import ActivityLogOut
from app.schemas.comment import CommentCreate, CommentOut

router = APIRouter(prefix="/tasks", tags=["tasks"])
UPLOAD_DIR = "uploads"  # relative to backend/ — where uploaded files actually live on disk

def _is_task_in_scope(task: Task, current_user: User) -> bool:
    """
    Check if a task is within the current user's view scope using cascade logic.
    """
    return can_view_task(current_user, task)


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status: TaskStatus | None = None,
    assigned_to: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List tasks based on cascade authorization:
    - Managers with project:view scoped to departments see tasks in those departments
    - Project Leads see tasks in their projects
    - Task Leads see their own tasks
    - Team members see tasks they're on
    """
    from sqlalchemy.orm import selectinload

    # Build base query with eager loading for cascade checks
    query = select(Task).options(
        selectinload(Task.project).selectinload(Project.departments),
        selectinload(Task.team_members),
    )

    if status is not None:
        query = query.where(Task.status == status)

    if assigned_to is not None:
        query = query.where(Task.assigned_to == assigned_to)

    result = await db.execute(query)
    tasks = result.scalars().all()

    # Filter by cascade logic
    visible_tasks = [task for task in tasks if can_view_task(current_user, task)]
    return [_task_to_out(task) for task in visible_tasks]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_out(task)


@router.get("/{task_id}/activity", response_model=list[ActivityLogOut])
async def get_task_activity(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity log for a task. Uses same view permission as get_task."""
    task = await _get_task_or_404_with_loads(db, task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")

    # Load activity logs for this task
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.entity_type == "task", ActivityLog.entity_id == task_id)
        .order_by(ActivityLog.created_at.desc())
    )
    logs = result.scalars().all()
    return logs


@router.get("/{task_id}/comments", response_model=list[CommentOut])
async def get_task_comments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all comments for a task, ordered by created_at ascending (oldest first). Gated by can_view_task."""
    task = await _get_task_or_404_with_loads(db, task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")

    result = await db.execute(
        select(Comment)
        .where(Comment.entity_type == "task", Comment.entity_id == task_id)
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()
    return comments


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Handle project_id - if provided, check project lead permissions
    if payload.project_id is not None:
        from sqlalchemy.orm import selectinload
        project_result = await db.execute(
            select(Project).options(selectinload(Project.departments)).where(Project.id == payload.project_id)
        )
        project = project_result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        if not can_create_task_in_project(current_user, project):
            raise HTTPException(status_code=403, detail="You can only create tasks in projects you lead")
        
        # For project tasks, resolve assignee - if not provided, auto-assign to self
        final_assignee_id = payload.assigned_to if payload.assigned_to is not None else current_user.id
    else:
        # Standalone task - apply permission rules
        if has_permission(current_user, "project:manage"):
            # project:manage users can assign to anyone within their department scope
            final_assignee_id = payload.assigned_to if payload.assigned_to is not None else current_user.id
            
            # Validate assignee exists and is within scope
            assignee_result = await db.execute(select(User).where(User.id == final_assignee_id))
            assignee = assignee_result.scalar_one_or_none()
            if assignee is None:
                raise HTTPException(status_code=404, detail="Assignee user not found")
            
            # Check if assignee is within user's department scope
            scoped = get_scoped_department_ids(current_user)
            if scoped is not None and assignee.department_id not in scoped:
                raise HTTPException(
                    status_code=403,
                    detail="You can only assign standalone tasks to users within your department scope"
                )
        else:
            # Users without project:manage can only create standalone tasks for themselves
            if payload.assigned_to is not None and payload.assigned_to != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only create standalone tasks for yourself"
                )
            final_assignee_id = current_user.id

    # Validate assignee exists (for project tasks, already validated above)
    if payload.project_id is not None:
        assignee_result = await db.execute(select(User).where(User.id == final_assignee_id))
        assignee = assignee_result.scalar_one_or_none()
        if assignee is None:
            raise HTTPException(status_code=404, detail="Assignee user not found")

    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        assigned_to=final_assignee_id,
        project_id=payload.project_id,
        created_by=current_user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    await log_activity(db, current_user.id, "task_created", "task", task.id, detail=payload.title)
    await db.commit()
    background_tasks.add_task(notification_dispatch.notify_task_assigned, task.id)
    task_with_loads = await _get_task_or_404_with_loads(db, task.id)
    return _task_to_out(task_with_loads)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_edit_delete_task(current_user, task):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this task")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    task_with_loads = await _get_task_or_404_with_loads(db, task.id)
    return _task_to_out(task_with_loads)


@router.patch("/{task_id}/status", response_model=TaskOut)
async def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Status changes with explicit transition rules:
    - Submit (To Do/Reschedule -> Review): allowed only for task.assigned_to
    - Approve (Review -> Done or Review -> Reschedule): allowed only for task.created_by
    - Manager override: can_manage_task() users who aren't the assignee or creator can still act, logged as override
    """
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    # Check if user is the assignee
    is_assignee = current_user.id == task.assigned_to

    # Check if user is the creator
    is_creator = current_user.id == task.created_by

    # Check if user has management authority
    has_management_authority = can_manage_task(current_user, task)

    # Determine if this is a manager override (has authority but is not the creator)
    is_manager_override = has_management_authority and not is_creator

    # Handle submit transition (To Do/Reschedule -> Review)
    if task.status in (TaskStatus.TODO, TaskStatus.RESCHEDULE) and payload.status == TaskStatus.REVIEW:
        # Check that all subtasks are Done before allowing submission (if task has subtasks)
        if task.subtasks:
            incomplete_subtasks = [
                f"'{subtask.title}' ({subtask.status.value})"
                for subtask in task.subtasks
                if subtask.status != "Done"
            ]
            if incomplete_subtasks:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot submit for review — the following subtasks are not yet Done: {', '.join(incomplete_subtasks)}."
                )

        # Check for required report and attachment before allowing submission
        report_result = await db.execute(
            select(Report).where(Report.task_id == task_id)
        )
        has_report = report_result.scalar_one_or_none() is not None

        attachment_result = await db.execute(
            select(Attachment).where(Attachment.task_id == task_id)
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
            if task.assigned_to is None:
                raise HTTPException(
                    status_code=400,
                    detail="Task has no assignee."
                )
            if is_manager_override:
                print(f"status changed by non-owner {current_user.id} via manager override")
            else:
                raise HTTPException(
                    status_code=403,
                    detail="Only the task's assignee can submit it for review"
                )

    # Handle approve transitions (Review -> Done or Review -> Reschedule)
    elif task.status == TaskStatus.REVIEW and payload.status in (TaskStatus.DONE, TaskStatus.RESCHEDULE):
        if not is_creator:
            if is_manager_override:
                print(f"status changed by non-owner {current_user.id} via manager override")
            else:
                raise HTTPException(
                    status_code=403,
                    detail="Only the task's creator can approve it or send it back"
                )

        # Require comment for approve/reschedule actions
        if not payload.comment or not payload.comment.strip():
            raise HTTPException(
                status_code=400,
                detail="A comment is required when approving or rescheduling a task."
            )

    # Reject any other transition
    else:
        valid_transitions = []
        if task.status in (TaskStatus.TODO, TaskStatus.RESCHEDULE):
            valid_transitions.append("Review (by assignee)")
        if task.status == TaskStatus.REVIEW:
            valid_transitions.append("Done (by creator)")
            valid_transitions.append("Reschedule (by creator)")
        raise HTTPException(
            status_code=403,
            detail=f"Invalid transition. From {task.status.value}, valid transitions are: {', '.join(valid_transitions)}"
        )

    old_status = task.status
    task.status = payload.status
    # If transitioning to RESCHEDULE and a due_date is provided, update it
    if payload.status == TaskStatus.RESCHEDULE and payload.due_date is not None:
        task.due_date = payload.due_date

    # Create comment for approve/reschedule actions (Review -> Done or Review -> Reschedule)
    if old_status == TaskStatus.REVIEW and payload.status in (TaskStatus.DONE, TaskStatus.RESCHEDULE):
        comment = Comment(
            author_id=current_user.id,
            entity_type="task",
            entity_id=task_id,
            content=payload.comment,
            action="approved" if payload.status == TaskStatus.DONE else "rescheduled",
        )
        db.add(comment)

    await log_activity(db, current_user.id, "task_status_changed", "task", task.id, detail=f"{old_status.value} -> {payload.status.value}")
    await db.commit()
    await db.refresh(task)
    if payload.status == TaskStatus.REVIEW:
        background_tasks.add_task(notification_dispatch.notify_task_submitted_for_review, task.id)
    elif payload.status == TaskStatus.RESCHEDULE:
        background_tasks.add_task(notification_dispatch.notify_task_rescheduled, task.id)
    elif payload.status == TaskStatus.DONE:
        background_tasks.add_task(notification_dispatch.notify_task_done, task.id)
    task_with_loads = await _get_task_or_404_with_loads(db, task.id)
    return _task_to_out(task_with_loads)

@router.patch("/{task_id}/assign", response_model=TaskOut)
async def assign_task(
    task_id: int,
    payload: TaskAssignRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_manage_task(current_user, task):
        raise HTTPException(status_code=403, detail="You do not have permission to assign this task")

    if payload.assigned_to is None:
        raise HTTPException(
            status_code=400,
            detail="Assignee cannot be null - tasks must be assigned to a user"
        )

    assignee_result = await db.execute(select(User).where(User.id == payload.assigned_to))
    assignee = assignee_result.scalar_one_or_none()
    if assignee is None:
        raise HTTPException(status_code=404, detail="Assignee user not found")

    task.assigned_to = assignee.id

    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(notification_dispatch.notify_task_assigned, task.id)
    task_with_loads = await _get_task_or_404_with_loads(db, task.id)
    return _task_to_out(task_with_loads)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_edit_delete_task(current_user, task):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this task")

    # Delete attachments for this task first (no DB-level cascade for attachments)
    attachments_result = await db.execute(select(Attachment).where(Attachment.task_id == task_id))
    attachments = attachments_result.scalars().all()
    for attachment in attachments:
        # Delete file from disk if it exists
        try:
            if os.path.exists(attachment.stored_path):
                os.remove(attachment.stored_path)
        except Exception:
            pass  # Missing file shouldn't fail the request
        # Delete preview file if it exists
        if attachment.preview_path:
            try:
                if os.path.exists(attachment.preview_path):
                    os.remove(attachment.preview_path)
            except Exception:
                pass  # Missing file shouldn't fail the request
        # Delete from database
        await db.delete(attachment)

    await log_activity(db, current_user.id, "task_deleted", "task", task_id, detail=task.title)
    await db.delete(task)
    await db.commit()


@router.put("/{task_id}/team", response_model=TaskOut)
async def update_task_team(
    task_id: int,
    payload: TaskTeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    # Load task with project.team_members for validation
    result = await db.execute(
        select(Task).options(
            selectinload(Task.assignee),
            selectinload(Task.project).selectinload(Project.departments),
            selectinload(Task.project).selectinload(Project.team_members),
            selectinload(Task.team_members),
        ).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Standalone tasks cannot have team members (no project to draw from)
    if task.project_id is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot assign team members to standalone tasks (tasks without a project)"
        )

    # Only the task's PROJECT lead can assign its team
    if not is_project_lead(current_user, task.project):
        raise HTTPException(
            status_code=403,
            detail="Only the project lead can assign task team members"
        )

    # Candidate pool is the PROJECT's team members
    project_team_user_ids = {tm.user_id for tm in task.project.team_members}

    # Validate all requested user_ids are in the project team
    for user_id in payload.user_ids:
        if user_id not in project_team_user_ids:
            raise HTTPException(
                status_code=400,
                detail="User must be a member of the project team"
            )

    # If lead_id is provided, validate it's in the user_ids list and in project team
    if payload.lead_id is not None:
        if payload.lead_id not in payload.user_ids:
            raise HTTPException(
                status_code=400,
                detail="Lead must be one of the assigned team members"
            )
        if payload.lead_id not in project_team_user_ids:
            raise HTTPException(
                status_code=400,
                detail="Lead must be a member of the project team"
            )

    # Check if the current assignee is in the new team
    if task.assigned_to is not None and task.assigned_to not in payload.user_ids:
        assignee_name = task.assignee.name if task.assignee else "unknown"
        raise HTTPException(
            status_code=400,
            detail=f"The task's current assignee ({assignee_name}) is not in the submitted team — either include them or reassign the task first."
        )

    # Delete existing team members
    await db.execute(
        delete(TaskTeam).where(TaskTeam.task_id == task_id)
    )

    # Insert new team members
    for user_id in payload.user_ids:
        team_member = TaskTeam(
            task_id=task_id,
            user_id=user_id,
            added_by=current_user.id,
        )
        db.add(team_member)

    # Set lead_id if provided
    if payload.lead_id is not None:
        task.lead_id = payload.lead_id

    # Set assignment markers (reusing approval columns)
    task.team_approved_by = current_user.id
    task.team_approved_at = datetime.now(timezone.utc)

    await log_activity(db, current_user.id, "task_team_updated", "task", task_id, detail=f"Team updated: {len(payload.user_ids)} members")
    await db.commit()
    await db.refresh(task)

    task_with_loads = await _get_task_or_404_with_loads(db, task.id)
    return _task_to_out(task_with_loads)


async def _get_task_or_404(db: AsyncSession, task_id: int) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def _get_task_or_404_with_loads(db: AsyncSession, task_id: int) -> Task:
    """Load task with relationships needed for cascade authorization checks."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Task).options(
            selectinload(Task.project).selectinload(Project.departments),
            selectinload(Task.creator),
            selectinload(Task.team_members),
            selectinload(Task.subtasks),
        ).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _task_to_out(task: Task) -> TaskOut:
    """Convert Task model to TaskOut schema."""
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        created_at=task.created_at,
        created_by=task.created_by,
        assigned_to=task.assigned_to,
        project_id=task.project_id,
        lead_id=task.lead_id,
        team_approved_by=task.team_approved_by,
        team_approved_at=task.team_approved_at,
        team_user_ids=[tm.user_id for tm in task.team_members],
        attachments=[],
    )

@router.post("/{task_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Saves the uploaded file to disk under uploads/{task_id}/, and creates a
    matching Attachment row pointing to it. Gated by the same task-visibility
    scope as everything else — if you can't see a task, you can't attach
    files to it either.
    """
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")

    task_dir = os.path.join(UPLOAD_DIR, str(task_id))
    os.makedirs(task_dir, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{file.filename}"
    stored_path = os.path.join(task_dir, stored_name)

    content = await file.read()
    with open(stored_path, "wb") as f:
        f.write(content)

    attachment = Attachment(
        task_id=task_id,
        filename=file.filename,
        stored_path=stored_path,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


@router.get("/{task_id}/attachments", response_model=list[AttachmentOut])
async def list_attachments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task_or_404_with_loads(db, task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")
    result = await db.execute(select(Attachment).where(Attachment.task_id == task_id))
    return result.scalars().all()


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    task = await _get_task_or_404_with_loads(db, attachment.task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Attachment not found")

    return FileResponse(
        attachment.stored_path,
        media_type=attachment.content_type,
        filename=attachment.filename,
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an attachment. Only the person who uploaded the attachment can delete it,
    and only while the associated task/subtask is in an editable state (To Do or Reschedule).
    """
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Only the uploader can delete their own attachment
    if current_user.id != attachment.uploaded_by:
        raise HTTPException(
            status_code=403,
            detail="Only the person who uploaded an attachment can delete it"
        )

    # Check editable state based on whether this is a task or subtask attachment
    if attachment.subtask_id is not None:
        # Subtask attachment - check subtask status
        subtask_result = await db.execute(select(SubTask).where(SubTask.id == attachment.subtask_id))
        subtask = subtask_result.scalar_one_or_none()
        if subtask is None:
            raise HTTPException(status_code=404, detail="Subtask not found")
        if subtask.status not in ("To Do", "Reschedule"):
            raise HTTPException(
                status_code=400,
                detail="Attachments can't be removed once the subtask is submitted for review"
            )
    else:
        # Task attachment - check task status
        task = await _get_task_or_404_with_loads(db, attachment.task_id)
        if not can_view_task(current_user, task):
            raise HTTPException(status_code=404, detail="Attachment not found")
        if task.status not in (TaskStatus.TODO, TaskStatus.RESCHEDULE):
            raise HTTPException(
                status_code=400,
                detail="Attachments can't be removed once the task is submitted for review"
            )

    # Delete file from disk if it exists
    if os.path.exists(attachment.stored_path):
        os.remove(attachment.stored_path)

    # Delete from database
    await db.delete(attachment)
    await db.commit()

@router.get("/attachments/{attachment_id}/preview")
async def preview_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    task = await _get_task_or_404_with_loads(db, attachment.task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Attachment not found")

    if attachment.content_type == "application/pdf" or attachment.content_type.startswith("image/"):
        return FileResponse(attachment.stored_path, media_type=attachment.content_type)

    if attachment.preview_path and os.path.exists(attachment.preview_path):
        return FileResponse(attachment.preview_path, media_type="application/pdf")

    try:
        with open(attachment.stored_path, "rb") as f:
            original_bytes = f.read()
        pdf_bytes = await convert_to_pdf(original_bytes, attachment.filename)
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Preview not available for this file type. Try downloading it instead.",
        )

    preview_dir = os.path.join(UPLOAD_DIR, str(attachment.task_id), "previews")
    os.makedirs(preview_dir, exist_ok=True)
    preview_path = os.path.join(preview_dir, f"{uuid.uuid4().hex}.pdf")
    with open(preview_path, "wb") as f:
        f.write(pdf_bytes)

    attachment.preview_path = preview_path
    await db.commit()

    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/{task_id}/reports", response_model=ReportOut, status_code=201)
async def create_task_report(
    task_id: int,
    payload: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a report for a task. Only the task lead can create reports."""
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not is_task_lead(current_user, task):
        raise HTTPException(status_code=403, detail="Only the task lead can create reports")

    report = Report(
        task_id=task_id,
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


@router.get("/{task_id}/reports", response_model=list[ReportOut])
async def list_task_reports(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reports for a task. Anyone who can view the task can view its reports."""
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_view_task(current_user, task):
        raise HTTPException(status_code=403, detail="You do not have permission to view this task")

    # Load reports with author, newest first
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.author))
        .where(Report.task_id == task_id)
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