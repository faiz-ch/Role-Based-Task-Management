from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskOut,
    TaskStatusUpdate,
    TaskAssignRequest,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status: TaskStatus | None = None,
    assigned_to: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Any logged-in user can list tasks (no special permission needed to VIEW),
    but WHICH tasks they see depends on the "task:view_all" permission:

      - doesn't have task:view_all -> ALWAYS forced to only their own tasks,
        no matter what `assigned_to` is passed as (can't be bypassed via API).

      - has task:view_all -> sees everything by default, but can optionally
        pass `assigned_to` (e.g. their own id) to filter down to a subset,
        such as a "My Tasks" toggle in the UI.
    """
    query = select(Task)
    if status is not None:
        query = query.where(Task.status == status)

    has_view_all = (
        current_user.role is not None
        and any(p.name == "task:view_all" for p in current_user.role.permissions)
    )

    if not has_view_all:
        query = query.where(Task.assigned_to == current_user.id)
    elif assigned_to is not None:
        query = query.where(Task.assigned_to == assigned_to)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("task:create")),
):
    task = Task(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        assigned_to=payload.assigned_to,
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
    _: User = Depends(require_permission("task:edit")),
):
    task = await _get_task_or_404(db, task_id)

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

      To Do -------------> In Progress   (assignee only)
      In Progress --------> Review        (reviewer only)
      Review --------------> Done         (reviewer only)
      Review --------------> Rejected     (reviewer only)
      Rejected -----------> In Progress   (assignee only, to resubmit)

    "Assignee" means current_user.id == task.assigned_to.
    "Reviewer" means the user's role has the "task:review" permission.
    Anyone with "task:edit" bypasses all of the above (e.g. Admin).

    Any transition not in this table (skipping steps, going backwards
    outside of the Rejected case, etc.) is rejected with a 400.
    """
    task = await _get_task_or_404(db, task_id)

    has_edit_permission = (
        current_user.role is not None
        and any(p.name == "task:edit" for p in current_user.role.permissions)
    )
    has_review_permission = (
        current_user.role is not None
        and any(p.name == "task:review" for p in current_user.role.permissions)
    )
    is_assignee = task.assigned_to == current_user.id

    if not has_edit_permission:
        ASSIGNEE_TRANSITIONS = {
            (TaskStatus.TODO, TaskStatus.IN_PROGRESS),
            (TaskStatus.REJECTED, TaskStatus.IN_PROGRESS),
        }
        REVIEWER_TRANSITIONS = {
            (TaskStatus.IN_PROGRESS, TaskStatus.REVIEW),
            (TaskStatus.REVIEW, TaskStatus.DONE),
            (TaskStatus.REVIEW, TaskStatus.REJECTED),
        }
        transition = (task.status, payload.status)

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


@router.patch("/{task_id}/assign", response_model=TaskOut)
async def assign_task(
    task_id: int,
    payload: TaskAssignRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("task:assign")),
):
    task = await _get_task_or_404(db, task_id)

    if payload.assigned_to is None:
        task.assigned_to = None
    else:
        assignee_result = await db.execute(select(User).where(User.id == payload.assigned_to))
        if assignee_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Assignee user not found")
        task.assigned_to = payload.assigned_to

    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("task:edit")),
):
    task = await _get_task_or_404(db, task_id)
    await db.delete(task)
    await db.commit()


async def _get_task_or_404(db: AsyncSession, task_id: int) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
