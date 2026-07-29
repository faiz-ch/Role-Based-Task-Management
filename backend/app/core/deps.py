"""
FastAPI dependencies used to protect routes.

get_current_user: reads the JWT from the Authorization header, figures out
WHO is calling, loads that user from the DB. Any route that needs a logged
in user just adds: current_user: User = Depends(get_current_user)

require_permission: builds on top of get_current_user. Checks if the
current user's role has a specific permission (e.g. "task:assign").
If not, blocks the request with a 403 before the route's own code even runs.
This is what makes RBAC actually enforced, not just decorative.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decode_token
from app.database import get_db
from app.models.user import User
from app.models.role import Role
from app.models.project import Project
from app.models.task import Task
from app.models.subtask import SubTask

# tokenUrl is just used by the /docs page to know where to send a login
# request from its "Authorize" button — it doesn't affect real API calls.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise credentials_error

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_error

    # Eager load all relationships needed for permission checks and scoping.
    # Separate selectinload branches from shared parent to avoid chaining issues.
    from app.models.category import Category
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.category).selectinload(Category.permissions),
            selectinload(User.role).selectinload(Role.departments),
            selectinload(User.role).selectinload(Role.assignable_categories).selectinload(Category.permissions),
            selectinload(User.department),
        )
        .where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_error

    return user


def require_permission(permission_name: str):
    """
    Usage in a route:
        @router.post("/tasks")
        async def create_task(..., user: User = Depends(require_permission("task:create"))):
    """

    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role is None or current_user.role.category is None:
            raise HTTPException(status_code=403, detail="User has no role or category assigned")

        user_permissions = {p.name for p in current_user.role.category.permissions}
        if permission_name not in user_permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Missing required permission: {permission_name}",
            )
        return current_user

    return checker


def has_permission(user: User, permission_name: str) -> bool:
    """Check if a user has a specific permission."""
    if user.role is None or user.role.category is None:
        return False
    return any(p.name == permission_name for p in user.role.category.permissions)


def get_scoped_department_ids(user: User) -> set[int] | None:
    """
    Returns None if the role has global (all_departments=True) scope —
    caller should skip department filtering entirely in that case.
    Returns a (possibly empty) set of department ids otherwise.
    """
    if user.role is None:
        return set()
    if user.role.all_departments:
        return None
    return {d.id for d in user.role.departments}


def is_project_lead(user: User, project: Project) -> bool:
    """Returns True if the user is the lead of the given project."""
    return project.lead_id == user.id


def is_task_lead(user: User, task: Task) -> bool:
    """Returns True if the user is the lead of the given task."""
    return task.lead_id == user.id


def can_manage_project(user: User, project: Project) -> bool:
    """
    Returns True if the user can manage the project.
    Combines role-based permission (project:manage) with instance-based ownership (project lead).
    This allows admins/managers to bypass ownership checks while still respecting lead authority.
    """
    return has_permission(user, "project:manage") or is_project_lead(user, project)


def can_create_task_in_project(user: User, project: Project) -> bool:
    """Only the project's lead can create tasks inside it — this is pure instance ownership, not a role permission."""
    return is_project_lead(user, project)


def can_manage_task(user: User, task: Task) -> bool:
    """
    Authority cascades: a Manager with project:manage scoped to this task's
    project's department(s) can manage any task in it; a Project Lead can
    manage any task inside their own project; a Task Lead can manage their
    specific task. No flat task-level permission exists anymore.
    For standalone tasks (project_id is None), only the creator or global
    project:manage users can manage (not the assignee, to prevent self-approval).
    """
    if task.project_id is None:
        # Standalone task - only creator or global managers can manage
        if user.id == task.created_by:
            return True
        if has_permission(user, "project:manage"):
            scoped = get_scoped_department_ids(user)
            if scoped is None:  # Global scope
                return True
        return False

    if has_permission(user, "project:manage"):
        scoped = get_scoped_department_ids(user)
        if scoped is None or any(d.id in scoped for d in task.project.departments):
            return True
    if is_project_lead(user, task.project):
        return True
    return is_task_lead(user, task)


def can_edit_delete_task(user: User, task: Task) -> bool:
    """
    Task edit/delete is restricted to project lead OR project:manage (NOT task lead).
    Task lead manages subtasks and day-to-day work, not the task's own existence/details.
    For standalone tasks (project_id is None), only the creator or global project:manage
    users can edit/delete.
    """
    if task.project_id is None:
        # Standalone task - only creator or global managers can edit/delete
        if user.id == task.created_by:
            return True
        if has_permission(user, "project:manage"):
            scoped = get_scoped_department_ids(user)
            if scoped is None:  # Global scope
                return True
        return False

    if has_permission(user, "project:manage"):
        scoped = get_scoped_department_ids(user)
        if scoped is None or any(d.id in scoped for d in task.project.departments):
            return True
    return is_project_lead(user, task.project)


def can_view_task(user: User, task: Task) -> bool:
    """
    Authority cascades for viewing: a Manager with project:view scoped to this task's
    project's department(s) can view any task in it; a Project Lead can view any task
    inside their own project; a Task Lead can view their specific task; a user can view
    tasks they're a team member of.
    For standalone tasks (project_id is None), only the creator, assignee, task lead,
    team members, or global project:view users can view.
    """
    if task.project_id is None:
        # Standalone task - creator, assignee, lead, team members, or global managers can view
        if user.id == task.created_by or user.id == task.assigned_to:
            return True
        if is_task_lead(user, task):
            return True
        if any(tm.user_id == user.id for tm in task.team_members):
            return True
        if has_permission(user, "project:view"):
            scoped = get_scoped_department_ids(user)
            if scoped is None:  # Global scope
                return True
        return False

    if has_permission(user, "project:view"):
        scoped = get_scoped_department_ids(user)
        if scoped is None or any(d.id in scoped for d in task.project.departments):
            return True
    if is_project_lead(user, task.project):
        return True
    if is_task_lead(user, task):
        return True
    # Check if user is in task team members
    return any(tm.user_id == user.id for tm in task.team_members)


def can_create_subtask_in_task(user: User, task: Task) -> bool:
    """
    Allow task lead, project lead, or project:manage (with department scope) to create subtasks.
    For standalone tasks (project_id is None), only the task lead or global project:manage
    users can create subtasks.
    """
    if task.project_id is None:
        # Standalone task - only task lead or global managers can create subtasks
        if is_task_lead(user, task):
            return True
        if has_permission(user, "project:manage"):
            scoped = get_scoped_department_ids(user)
            if scoped is None:  # Global scope
                return True
        return False

    if is_task_lead(user, task):
        return True
    if is_project_lead(user, task.project):
        return True
    if has_permission(user, "project:manage"):
        scoped = get_scoped_department_ids(user)
        if scoped is None or any(d.id in scoped for d in task.project.departments):
            return True
    return False


def get_assignable_user_pool(db_users: list[User], department_ids: set[int]) -> list[User]:
    """
    Given a list of candidate users, return those in the given department_ids.
    Team/lead eligibility for projects, tasks, and subtasks is based purely on
    department membership — not on the selector's assignable_categories, which
    is a separate, unrelated setting for user-creation permission delegation.
    """
    return [u for u in db_users if u.department_id in department_ids]


def can_view_subtask(user: User, subtask: SubTask) -> bool:
    """
    Returns True if the user can view the subtask.
    A user can view a subtask if they can view the parent task OR if they are one of the subtask's assignees.
    """
    if can_view_task(user, subtask.task):
        return True
    # Check if user is in subtask assignees
    return any(sa.user_id == user.id for sa in subtask.assignees)


def can_manage_subtask(user: User, subtask: SubTask) -> bool:
    """
    Returns True if the user can manage the subtask.
    A user can manage a subtask if they can manage the parent task OR if they are one of the subtask's assignees.
    Note: Assignees can update their own subtask's status/details, but not reassign it to others — that distinction
    is enforced in the endpoint, not in this helper.
    """
    if can_manage_task(user, subtask.task):
        return True
    # Check if user is in subtask assignees
    return any(sa.user_id == user.id for sa in subtask.assignees)