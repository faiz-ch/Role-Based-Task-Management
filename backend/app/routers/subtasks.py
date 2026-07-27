from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
    get_assignable_user_pool,
)
from app.database import get_db
from app.models.user import User
from app.models.task import Task
from app.models.project import Project
from app.models.subtask import SubTask, SubTaskAssignee
from app.schemas.subtask import (
    SubtaskCreate,
    SubtaskUpdate,
    SubtaskStatusUpdate,
    SubtaskAssigneeUpdate,
    SubtaskOut,
)

router = APIRouter(prefix="/subtasks", tags=["subtasks"])


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update subtask status with explicit transition rules:
    - Subtask assignees can only submit: To Do or Reschedule → Review
    - Task lead, project lead, or project:manage can approve (Review → Done) or send back (Review → Reschedule)
    - Nobody else can change a subtask's status
    """
    subtask = await _get_subtask_or_404_with_loads(db, subtask_id)

    # Check if user is an assignee
    is_assignee = any(sa.user_id == current_user.id for sa in subtask.assignees)

    # Check if user has management authority (task lead, project lead, or project:manage with scope)
    has_management_authority = can_manage_task(current_user, subtask.task)

    # Determine what transitions are allowed based on user role
    if is_assignee and not has_management_authority:
        # Assignees can only submit: To Do or Reschedule → Review
        if subtask.status not in ("To Do", "Reschedule"):
            raise HTTPException(
                status_code=403,
                detail="Assignees can only submit subtasks for review when they are in To Do or Reschedule status"
            )
        if payload.status != "Review":
            raise HTTPException(
                status_code=403,
                detail="Assignees can only submit subtasks for review (set status to Review)"
            )
    elif has_management_authority:
        # Task lead, project lead, or project:manage can approve (Review → Done) or send back (Review → Reschedule)
        if subtask.status != "Review":
            raise HTTPException(
                status_code=403,
                detail="Only subtasks in Review status can be approved or sent back"
            )
        if payload.status not in ("Done", "Reschedule"):
            raise HTTPException(
                status_code=403,
                detail="Managers can only approve (set to Done) or send back (set to Reschedule) subtasks in Review"
            )
    else:
        # User is neither an assignee nor has management authority
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to change this subtask's status"
        )

    subtask.status = payload.status
    await db.commit()
    await db.refresh(subtask)

    subtask_with_loads = await _get_subtask_or_404_with_loads(db, subtask.id)
    return _subtask_to_out(subtask_with_loads)


@router.put("/{subtask_id}/assignees", response_model=SubtaskOut)
async def update_subtask_assignees(
    subtask_id: int,
    payload: SubtaskAssigneeUpdate,
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
