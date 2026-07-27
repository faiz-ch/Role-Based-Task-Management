import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, Response
from app.services.conversion import convert_to_pdf
from app.services import notification_dispatch
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user, has_permission, get_scoped_department_ids, can_view_task, can_manage_task, can_edit_delete_task, can_create_task_in_project, is_project_lead, is_task_lead, get_assignable_user_pool
from app.database import get_db
from app.models.task import Task, TaskStatus, TaskTeam
from app.models.attachment import Attachment
from app.models.user import User
from app.models.project import Project
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskOut,
    TaskStatusUpdate,
    TaskAssignRequest,
    RescheduleRequest,
    TaskTeamUpdate,
    AttachmentOut,
)

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


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load project and check if user can create tasks in it
    from sqlalchemy.orm import selectinload
    project_result = await db.execute(
        select(Project).options(selectinload(Project.departments)).where(Project.id == payload.project_id)
    )
    project = project_result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not can_create_task_in_project(current_user, project):
        raise HTTPException(status_code=403, detail="You can only create tasks in projects you lead")

    # Resolve assignee - if not provided, auto-assign to self
    final_assignee_id = payload.assigned_to if payload.assigned_to is not None else current_user.id

    # Validate assignee exists
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
    Status changes are now unified: anyone with can_manage_task can change status.
    This includes Managers with project:manage, Project Leads, and Task Leads.
    No separate reviewer concept anymore.
    """
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_manage_task(current_user, task):
        raise HTTPException(status_code=403, detail="You do not have permission to change this task's status")

    task.status = payload.status
    await db.commit()
    await db.refresh(task)
    if payload.status == TaskStatus.REVIEW:
        background_tasks.add_task(notification_dispatch.notify_task_submitted_for_review, task.id)
    elif payload.status == TaskStatus.DONE:
        background_tasks.add_task(notification_dispatch.notify_task_done, task.id)
    task_with_loads = await _get_task_or_404_with_loads(db, task.id)
    return _task_to_out(task_with_loads)

@router.patch("/{task_id}/reschedule", response_model=TaskOut)
async def reschedule_task(
    task_id: int,
    payload: RescheduleRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The one and only way a task moves Review -> Reschedule. Separate from
    update_task_status because this transition requires extra data (the new
    due date) that the generic status endpoint has no way to carry.
    """
    from sqlalchemy.orm import selectinload
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_manage_task(current_user, task):
        raise HTTPException(status_code=403, detail="You do not have permission to reschedule this task")

    if task.status != TaskStatus.REVIEW:
        raise HTTPException(
            status_code=400,
            detail="Only tasks currently in Review can be rescheduled.",
        )

    task.status = TaskStatus.RESCHEDULE
    task.due_date = payload.new_due_date
    await db.commit()
    await db.refresh(task)
    background_tasks.add_task(notification_dispatch.notify_task_rescheduled, task.id)
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
            selectinload(Task.project).selectinload(Project.departments),
            selectinload(Task.project).selectinload(Project.team_members),
            selectinload(Task.team_members),
        ).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

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
            selectinload(Task.team_members),
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
    Delete an attachment. Only the task's assignee can delete attachments,
    and only while the task is in an editable state (To Do or Reschedule).
    Once a task is submitted for review (Review or Done status), attachments
    are locked until the task is sent back to Reschedule.
    """
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    task = await _get_task_or_404_with_loads(db, attachment.task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Only the assignee can delete attachments
    if current_user.id != task.assigned_to:
        raise HTTPException(
            status_code=403,
            detail="Only the task's assignee can delete attachments"
        )

    # Can only delete when task is in editable state
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