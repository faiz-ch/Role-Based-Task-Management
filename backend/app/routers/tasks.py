from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user, has_permission, get_scoped_department_ids
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

    has_edit_permission = has_permission(current_user, "task:edit")
    has_review_permission = has_permission(current_user, "task:review")
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
