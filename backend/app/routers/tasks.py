import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user, has_permission, get_scoped_department_ids
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.attachment import Attachment
from app.models.user import User
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskOut,
    TaskStatusUpdate,
    TaskAssignRequest,
    RescheduleRequest,
    AttachmentOut,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])
UPLOAD_DIR = "uploads"  # relative to backend/ — where uploaded files actually live on disk

def _is_task_in_scope(task: Task, current_user: User) -> bool:
    """
    Check if a task is within the current user's view scope.
    Used by task:edit, task:delete, and task:review to inherit view scope.
    """
    if not has_permission(current_user, "task:view"):
        # No view permission - only see own tasks
        return task.assigned_to == current_user.id
    
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is None:
        # Global scope - can see all tasks
        return True
    # Department scope - check if task is in scoped departments
    return task.department_id in scoped_dept_ids


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status: TaskStatus | None = None,
    assigned_to: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Any logged-in user can list tasks (no special permission needed to VIEW),
    but WHICH tasks they see depends on their view scope:

      - task:view permission + all_departments=True -> sees all tasks
      - task:view permission + specific departments -> sees only tasks in those departments
      - no task:view permission -> sees only tasks assigned to them
    """
    query = select(Task)
    if status is not None:
        query = query.where(Task.status == status)

    if not has_permission(current_user, "task:view"):
        # No view permission - only see own tasks
        query = query.where(Task.assigned_to == current_user.id)
    else:
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None:
            # Global scope - sees everything
            if assigned_to is not None:
                query = query.where(Task.assigned_to == assigned_to)
        else:
            # Department scope
            if not scoped_dept_ids:
                return []  # Empty scope = no tasks visible
            query = query.where(Task.department_id.in_(scoped_dept_ids))

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task_or_404(db, task_id)
    if not _is_task_in_scope(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("task:create")),
):
    # Resolve assignee based on permissions
    if not has_permission(current_user, "task:assign"):
        # No assign permission - auto-assign to self
        final_assignee_id = current_user.id
    else:
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None:
            # Global assign scope - can assign to anyone
            assignee_result = await db.execute(select(User).where(User.id == payload.assigned_to))
            assignee = assignee_result.scalar_one_or_none()
            if assignee is None:
                raise HTTPException(status_code=404, detail="Assignee user not found")
            final_assignee_id = assignee.id
        else:
            # Department assign scope - can only assign to users in scoped departments
            if not scoped_dept_ids:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot assign tasks because your role has no departments assigned"
                )
            assignee_result = await db.execute(select(User).where(User.id == payload.assigned_to))
            assignee = assignee_result.scalar_one_or_none()
            if assignee is None:
                raise HTTPException(status_code=404, detail="Assignee user not found")
            if assignee.department_id not in scoped_dept_ids:
                raise HTTPException(
                    status_code=403,
                    detail="You can only assign tasks within your role's departments"
                )
            final_assignee_id = assignee.id
    
    # Fetch assignee to get department_id
    assignee_result = await db.execute(select(User).where(User.id == final_assignee_id))
    assignee = assignee_result.scalar_one_or_none()
    
    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        assigned_to=final_assignee_id,
        department_id=assignee.department_id if assignee else None,
        created_by=current_user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("task:edit")),
):
    task = await _get_task_or_404(db, task_id)
    
    # Check if task is within user's view scope
    if not _is_task_in_scope(task, current_user):
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/status", response_model=TaskOut)
async def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Status changes follow a fixed workflow, and WHO can make each specific
    transition depends on their role:

      To Do -------------> Review        (assignee only, submits their work)
      Reschedule ---------> Review        (assignee only, resubmits)
      Review --------------> Done         (reviewer only, approves)

    Review -> Reschedule is NOT handled here — it requires a new due date,
    so it goes through the dedicated /{task_id}/reschedule endpoint instead.

    "Assignee" means current_user.id == task.assigned_to.
    "Reviewer" means the user's role has the "task:review" permission.
    Anyone with "task:edit" bypasses all of the above (e.g. Admin).

    Any transition not in this table (skipping steps, going backwards
    outside of the Reschedule case, or trying to jump straight to
    Reschedule through this endpoint) is rejected with a 400/403.
    """
    task = await _get_task_or_404(db, task_id)

    has_edit_permission = has_permission(current_user, "task:edit")
    has_review_permission = has_permission(current_user, "task:review")
    is_assignee = task.assigned_to == current_user.id

    if not has_edit_permission:
        ASSIGNEE_TRANSITIONS = {
            (TaskStatus.TODO, TaskStatus.REVIEW),
            (TaskStatus.RESCHEDULE, TaskStatus.REVIEW),
        }
        REVIEWER_TRANSITIONS = {
            (TaskStatus.REVIEW, TaskStatus.DONE),
        }
        transition = (task.status, payload.status)

        # For reviewer transitions, also check task scope
        if transition in REVIEWER_TRANSITIONS and has_review_permission:
            if not _is_task_in_scope(task, current_user):
                raise HTTPException(
                    status_code=403,
                    detail="You cannot review tasks outside your view scope.",
                )

        allowed = (
            (transition in ASSIGNEE_TRANSITIONS and is_assignee)
            or (transition in REVIEWER_TRANSITIONS and has_review_permission)
        )
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="You cannot make this status change on this task.",
            )

    task.status = payload.status
    await db.commit()
    await db.refresh(task)
    return task

@router.patch("/{task_id}/reschedule", response_model=TaskOut)
async def reschedule_task(
    task_id: int,
    payload: RescheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The one and only way a task moves Review -> Reschedule. Separate from
    update_task_status because this transition requires extra data (the new
    due date) that the generic status endpoint has no way to carry.
    """
    task = await _get_task_or_404(db, task_id)

    if not _is_task_in_scope(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")

    if not has_permission(current_user, "task:review"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to reschedule this task.",
        )

    if task.status != TaskStatus.REVIEW:
        raise HTTPException(
            status_code=400,
            detail="Only tasks currently in Review can be rescheduled.",
        )

    task.status = TaskStatus.RESCHEDULE
    task.due_date = payload.new_due_date
    await db.commit()
    await db.refresh(task)
    return task

@router.patch("/{task_id}/assign", response_model=TaskOut)
async def assign_task(
    task_id: int,
    payload: TaskAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check assign permissions
    if not has_permission(current_user, "task:assign"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to assign tasks"
        )
    
    task = await _get_task_or_404(db, task_id)

    if payload.assigned_to is None:
        raise HTTPException(
            status_code=400,
            detail="Assignee cannot be null - tasks must be assigned to a user"
        )
    
    assignee_result = await db.execute(select(User).where(User.id == payload.assigned_to))
    assignee = assignee_result.scalar_one_or_none()
    if assignee is None:
        raise HTTPException(status_code=404, detail="Assignee user not found")
    
    # Validate department scope for users with specific departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if not scoped_dept_ids:
            raise HTTPException(
                status_code=403,
                detail="You cannot assign tasks because your role has no departments assigned"
            )
        if assignee.department_id not in scoped_dept_ids:
            raise HTTPException(
                status_code=403,
                detail="You can only assign tasks within your role's departments"
            )
    
    task.assigned_to = assignee.id
    # Sync department_id with assignee's department
    task.department_id = assignee.department_id

    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("task:delete")),
):
    task = await _get_task_or_404(db, task_id)
    
    # Check if task is within user's view scope
    if not _is_task_in_scope(task, current_user):
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )
    
    await db.delete(task)
    await db.commit()


async def _get_task_or_404(db: AsyncSession, task_id: int) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

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
    task = await _get_task_or_404(db, task_id)

    if not _is_task_in_scope(task, current_user):
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
    task = await _get_task_or_404(db, task_id)
    if not _is_task_in_scope(task, current_user):
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

    task = await _get_task_or_404(db, attachment.task_id)
    if not _is_task_in_scope(task, current_user):
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

    task = await _get_task_or_404(db, attachment.task_id)
    if not _is_task_in_scope(task, current_user):
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