from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
import os
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    require_permission, get_current_user, has_permission, get_scoped_department_ids,
    user_load_options, can_assign_role, load_assign_context,
)
from app.core.security import hash_password
from app.database import get_db
from app.models.user import User, user_managed_department, user_extra_assignable_role
from app.models.role import Role
from app.models.department import Department
from app.models.task import Task
from app.models.project import Project, ProjectTeam
from app.models.subtask import SubTask, SubTaskAssignee
from app.models.report import Report
from app.models.attachment import Attachment
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.schemas.user import UserOut, UserUpdate, AssignRoleRequest, AssignDepartmentRequest, UserCreate, PerformanceCategoryOut, UserPerformanceOut
from app.services import notification_dispatch
from app.services.activity_log import log_activity
from app.schemas.activity_log import ActivityLogOut

router = APIRouter(prefix="/users", tags=["users"])
UPLOAD_DIR = "uploads"
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User list access is now scoped based on user:view permissions."""
    if not has_permission(current_user, "user:view"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")
    
    query = select(User).options(*user_load_options())
    
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if not scoped_dept_ids:
            return []  # Empty scope = no users visible
        query = query.where(User.department_id.in_(scoped_dept_ids))
    
    result = await db.execute(query)
    return result.scalars().all()


async def _load_user_out(db: AsyncSession, user_id: int) -> User:
    """Re-fetch a user with everything UserOut needs (avoids MissingGreenlet)."""
    result = await db.execute(
        select(User).options(*user_load_options()).where(User.id == user_id)
    )
    return result.scalar_one()


async def _validate_department_ids(db: AsyncSession, dept_ids: list[int]) -> None:
    for dept_id in set(dept_ids):
        dept_result = await db.execute(select(Department).where(Department.id == dept_id))
        if dept_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"Department with id {dept_id} not found")


def _check_scope_grant(current_user: User, manage_all: bool | None, managed_ids: list[int] | None) -> None:
    """
    No-escalation rule for department scope: a user who does not manage ALL
    departments cannot grant "All Departments", and can only grant departments
    that they manage themselves.
    """
    scoped = get_scoped_department_ids(current_user)
    if scoped is None:
        return
    if manage_all:
        raise HTTPException(status_code=403, detail="Only users who manage all departments can grant 'All Departments'")
    if managed_ids:
        outside = set(managed_ids) - scoped
        if outside:
            raise HTTPException(status_code=403, detail="You can only grant departments that you manage yourself")


async def _resolve_extra_roles(
    db: AsyncSession,
    current_user: User,
    requested_ids: list[int],
    existing: list[Role] | None = None,
) -> list[Role]:
    """
    Lock 1 — you can only give what you can give: every requested extra role
    must be a role the CURRENT user is allowed to assign.
    On update, extras the current user cannot assign (granted earlier by
    someone with wider authority) are preserved rather than silently removed.
    """
    requested_ids = list(dict.fromkeys(requested_ids))
    roles: list[Role] = []
    for role_id in requested_ids:
        role_result = await db.execute(select(Role).where(Role.id == role_id))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail=f"Role with id {role_id} not found")
        if not can_assign_role(current_user, role):
            raise HTTPException(status_code=403, detail=f"You cannot grant '{role.name}' as an extra assignable role")
        roles.append(role)
    if existing:
        kept = [r for r in existing if r.id not in requested_ids and not can_assign_role(current_user, r)]
        roles = kept + roles
    return roles


async def _replace_extra_roles(db: AsyncSession, user_id: int, roles: list[Role]) -> None:
    await db.execute(user_extra_assignable_role.delete().where(user_extra_assignable_role.c.user_id == user_id))
    for role in roles:
        await db.execute(user_extra_assignable_role.insert().values(user_id=user_id, role_id=role.id))


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    # ---- Validate EVERYTHING before writing anything ----
    await load_assign_context(db, current_user)   # needed by can_assign_role()
    scoped_dept_ids = get_scoped_department_ids(current_user)

    # Home department: a department-scoped creator must place the user in one
    # of the departments they manage (otherwise they could not see the user).
    if scoped_dept_ids is not None:
        if not scoped_dept_ids:
            raise HTTPException(
                status_code=403,
                detail="You cannot create users because you do not manage any department",
            )
        if payload.department_id is None:
            raise HTTPException(status_code=400, detail="Please select a department for this user")
        if payload.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=403, detail="You can only add users to departments you manage")
    if payload.department_id is not None:
        await _validate_department_ids(db, [payload.department_id])

    # Role: base list + creator's extras, filtered by department tag
    if payload.role_id is not None:
        role_result = await db.execute(select(Role).where(Role.id == payload.role_id))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")
        if current_user.role is None:
            raise HTTPException(status_code=403, detail="You cannot assign roles because you have no role")
        if not can_assign_role(current_user, role):
            raise HTTPException(status_code=403, detail="You are not allowed to assign this role")

    # Department scope this new user will MANAGE (no escalation)
    managed_ids = [] if payload.manage_all_departments else list(dict.fromkeys(payload.managed_department_ids))
    _check_scope_grant(current_user, payload.manage_all_departments, managed_ids)
    await _validate_department_ids(db, managed_ids)

    # Personal extra assignable roles (Lock 1)
    extra_roles = await _resolve_extra_roles(db, current_user, payload.extra_assignable_role_ids)

    # ---- Write ----
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        department_id=payload.department_id,
        is_active=payload.is_active,
        manage_all_departments=payload.manage_all_departments,
    )
    db.add(user)
    await db.flush()  # get user.id

    for dept_id in managed_ids:
        await db.execute(user_managed_department.insert().values(user_id=user.id, department_id=dept_id))
    await _replace_extra_roles(db, user.id, extra_roles)
    await log_activity(db, current_user.id, "user_created", "user", user.id, detail=f"Account created by {current_user.name}")
    await db.commit()

    if payload.send_welcome_email:
        background_tasks.add_task(notification_dispatch.notify_user_created, user.id)

    return await _load_user_out(db, user.id)


@router.get("/me", response_model=UserOut)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any logged-in user can see their own profile — no special permission needed."""
    # get_current_user loads only what permission checks need; load the full profile here
    return await _load_user_out(db, current_user.id)


@router.get("/me/permissions", response_model=list[str])
async def get_me_permissions(current_user: User = Depends(get_current_user)):
    """Any logged-in user can see their own permissions list."""
    if current_user.role is None:
        return []
    return [p.name for p in current_user.role.permissions]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")
    
    result = await db.execute(
        select(User)
        .options(*user_load_options())
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Department-tier users can only view users in their scoped departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")
    
    return user


@router.get("/{user_id}/performance", response_model=UserPerformanceOut)
async def get_user_performance(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")

    target_result = await db.execute(select(User).where(User.id == user_id))
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if target_user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)

    async def _category_stats(model, lead_or_assignee_filter):
        result = await db.execute(select(model).where(lead_or_assignee_filter))
        items = result.scalars().all()
        total = len(items)
        completed = sum(1 for i in items if i.completed_at is not None)
        on_time = sum(
            1 for i in items
            if i.completed_at is not None and (i.due_date is None or i.completed_at <= i.due_date)
        )
        late = sum(
            1 for i in items
            if i.completed_at is not None and i.due_date is not None and i.completed_at > i.due_date
        )
        overdue = sum(
            1 for i in items
            if i.completed_at is None and i.due_date is not None and i.due_date < now
        )
        pending = total - completed - overdue
        return PerformanceCategoryOut(
            total=total, completed=completed, on_time=on_time,
            late=late, overdue=overdue, pending=pending,
        )

    projects_stats = await _category_stats(Project, Project.lead_id == user_id)
    tasks_stats = await _category_stats(Task, Task.lead_id == user_id)

    # Subtasks are many-to-many via SubTaskAssignee, handle separately
    subtask_result = await db.execute(
        select(SubTask)
        .join(SubTaskAssignee, SubTaskAssignee.subtask_id == SubTask.id)
        .where(SubTaskAssignee.user_id == user_id)
    )
    subtask_items = subtask_result.scalars().all()
    st_total = len(subtask_items)
    st_completed = sum(1 for i in subtask_items if i.completed_at is not None)
    st_on_time = sum(
        1 for i in subtask_items
        if i.completed_at is not None and (i.due_date is None or i.completed_at <= i.due_date)
    )
    st_late = sum(
        1 for i in subtask_items
        if i.completed_at is not None and i.due_date is not None and i.completed_at > i.due_date
    )
    st_overdue = sum(
        1 for i in subtask_items
        if i.completed_at is None and i.due_date is not None and i.due_date < now
    )
    st_pending = st_total - st_completed - st_overdue
    subtasks_stats = PerformanceCategoryOut(
        total=st_total, completed=st_completed, on_time=st_on_time,
        late=st_late, overdue=st_overdue, pending=st_pending,
    )

    return UserPerformanceOut(
        projects=projects_stats, tasks=tasks_stats, subtasks=subtasks_stats,
    )


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    result = await db.execute(
        select(User).options(*user_load_options()).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Department-tier users can only edit users in their scoped departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    # Only fields the client actually sent are applied
    sent = payload.model_fields_set
    changed_fields = []

    if payload.name is not None:
        user.name = payload.name
        changed_fields.append("name")
    if payload.email is not None:
        existing = await db.execute(
            select(User).where(User.email == payload.email, User.id != user_id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = payload.email
        changed_fields.append("email")
    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changed_fields.append("is_active")

    # Home department (null or 0 = unassign)
    if "department_id" in sent:
        new_dept_id = payload.department_id or None
        if scoped_dept_ids is not None:
            if new_dept_id is None:
                raise HTTPException(status_code=403, detail="You cannot remove a user from your departments")
            if new_dept_id not in scoped_dept_ids:
                raise HTTPException(status_code=403, detail="You can only assign users to departments you manage")
        if new_dept_id is not None:
            await _validate_department_ids(db, [new_dept_id])
        if new_dept_id != user.department_id:
            user.department_id = new_dept_id
            changed_fields.append("department_id")

    # Manager (null = clear)
    if "manager_id" in sent:
        if payload.manager_id is not None:
            if payload.manager_id == user_id:
                raise HTTPException(status_code=400, detail="A user cannot be their own manager")
            manager_result = await db.execute(select(User).where(User.id == payload.manager_id))
            if manager_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Manager not found")
        if payload.manager_id != user.manager_id:
            user.manager_id = payload.manager_id
            changed_fields.append("manager_id")

    # "All Departments" toggle — only someone with global scope may change it
    if payload.manage_all_departments is not None and payload.manage_all_departments != user.manage_all_departments:
        if scoped_dept_ids is not None:
            raise HTTPException(status_code=403, detail="Only users who manage all departments can change 'All Departments'")
        user.manage_all_departments = payload.manage_all_departments
        changed_fields.append("manage_all_departments")

    # Departments this user manages
    if payload.managed_department_ids is not None:
        requested = list(dict.fromkeys(payload.managed_department_ids))
        _check_scope_grant(current_user, None, requested)
        await _validate_department_ids(db, requested)
        # Preserve departments the editor cannot see (granted by someone with wider scope)
        if scoped_dept_ids is not None:
            kept = [d.id for d in user.managed_departments if d.id not in scoped_dept_ids]
            requested = kept + [d for d in requested if d not in kept]
        await db.execute(user_managed_department.delete().where(user_managed_department.c.user_id == user_id))
        for dept_id in requested:
            await db.execute(user_managed_department.insert().values(user_id=user.id, department_id=dept_id))
        changed_fields.append("managed_departments")

    # A global-scope user does not also need a department list
    if user.manage_all_departments and payload.manage_all_departments:
        await db.execute(user_managed_department.delete().where(user_managed_department.c.user_id == user_id))

    # Personal extra assignable roles (Lock 1)
    if payload.extra_assignable_role_ids is not None:
        await load_assign_context(db, current_user)   # needed by can_assign_role()
        extra_roles = await _resolve_extra_roles(
            db, current_user, payload.extra_assignable_role_ids, existing=list(user.extra_assignable_roles)
        )
        await _replace_extra_roles(db, user.id, extra_roles)
        changed_fields.append("extra_assignable_roles")

    if changed_fields:
        await log_activity(db, current_user.id, "user_updated", "user", user.id, detail=f"Updated: {', '.join(changed_fields)}")
    if payload.password is not None:
        await log_activity(db, current_user.id, "password_changed", "user", user.id, detail="Password changed")
    await db.commit()

    db.expire_all()
    return await _load_user_out(db, user_id)


@router.patch("/{user_id}/role", response_model=UserOut)
async def assign_role(
    user_id: int,
    payload: AssignRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Department-tier users can only edit users in their scoped departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    role = None
    if payload.role_id is None:
        user.role_id = None
    else:
        role_result = await db.execute(select(Role).where(Role.id == payload.role_id))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")
        if current_user.role is None:
            raise HTTPException(status_code=403, detail="You cannot assign roles because you have no role")
        await load_assign_context(db, current_user)   # needed by can_assign_role()
        # Base list + current user's personal extras, then department-tag filter
        if not can_assign_role(current_user, role):
            raise HTTPException(status_code=403, detail="You are not allowed to assign this role")
        user.role_id = role.id

    await log_activity(db, current_user.id, "role_assigned", "user", user_id, detail=f"Role changed to '{role.name}'" if role else "Role removed")
    await db.commit()

    db.expire_all()
    return await _load_user_out(db, user_id)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Department-tier users can only delete users in their scoped departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    # Block if user created any tasks
    tasks_created_result = await db.execute(
        select(Task).where(Task.created_by == user_id)
    )
    if tasks_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created tasks that still exist. Reassign or delete those tasks before deleting the user."
        )

    # Block if user created any projects
    projects_created_result = await db.execute(
        select(Project).where(Project.created_by == user_id)
    )
    if projects_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created projects that still exist. Reassign or delete those projects before deleting the user."
        )

    # Block if user created any subtasks
    subtasks_created_result = await db.execute(
        select(SubTask).where(SubTask.created_by == user_id)
    )
    if subtasks_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created subtasks that still exist. Reassign or delete those subtasks before deleting the user."
        )

    # Block if user authored any reports
    reports_created_result = await db.execute(
        select(Report).where(Report.created_by == user_id)
    )
    if reports_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user authored reports that still exist. Delete those reports before deleting the user."
        )

    # Block if user uploaded any attachments
    attachments_uploaded_result = await db.execute(
        select(Attachment).where(Attachment.uploaded_by == user_id)
    )
    if attachments_uploaded_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user uploaded attachments that still exist. Delete those attachments before deleting the user."
        )

    # Null out nullable role columns
    # Project.lead_id
    projects_lead_result = await db.execute(
        select(Project).where(Project.lead_id == user_id)
    )
    projects_lead = projects_lead_result.scalars().all()
    for project in projects_lead:
        project.lead_id = None

    # Task.lead_id
    tasks_lead_result = await db.execute(
        select(Task).where(Task.lead_id == user_id)
    )
    tasks_lead = tasks_lead_result.scalars().all()
    for task in tasks_lead:
        task.lead_id = None

    # Project.team_approved_by
    projects_approved_result = await db.execute(
        select(Project).where(Project.team_approved_by == user_id)
    )
    projects_approved = projects_approved_result.scalars().all()
    for project in projects_approved:
        project.team_approved_by = None

    # Task.team_approved_by
    tasks_approved_result = await db.execute(
        select(Task).where(Task.team_approved_by == user_id)
    )
    tasks_approved = tasks_approved_result.scalars().all()
    for task in tasks_approved:
        task.team_approved_by = None

    # Department.head_id
    departments_headed_result = await db.execute(
        select(Department).where(Department.head_id == user_id)
    )
    departments_headed = departments_headed_result.scalars().all()
    for dept in departments_headed:
        dept.head_id = None

    # Reassign NOT NULL audit trail columns to current_user
    # ProjectTeam.added_by
    project_teams_result = await db.execute(
        select(ProjectTeam).where(ProjectTeam.added_by == user_id)
    )
    project_teams = project_teams_result.scalars().all()
    for pt in project_teams:
        pt.added_by = current_user.id

    # TaskTeam.added_by
    from app.models.task import TaskTeam
    task_teams_result = await db.execute(
        select(TaskTeam).where(TaskTeam.added_by == user_id)
    )
    task_teams = task_teams_result.scalars().all()
    for tt in task_teams:
        tt.added_by = current_user.id

    # SubTaskAssignee.assigned_by
    subtask_assignees_result = await db.execute(
        select(SubTaskAssignee).where(SubTaskAssignee.assigned_by == user_id)
    )
    subtask_assignees = subtask_assignees_result.scalars().all()
    for sa in subtask_assignees:
        sa.assigned_by = current_user.id

    # ActivityLog.actor_id
    activity_logs_result = await db.execute(
        select(ActivityLog).where(ActivityLog.actor_id == user_id)
    )
    activity_logs = activity_logs_result.scalars().all()
    for log in activity_logs:
        log.actor_id = current_user.id

    # Comment.author_id
    comments_result = await db.execute(
        select(Comment).where(Comment.author_id == user_id)
    )
    comments = comments_result.scalars().all()
    for comment in comments:
        comment.author_id = current_user.id

    # Unassign tasks where this user is the assignee (existing logic)
    assigned_tasks_result = await db.execute(
        select(Task).where(Task.assigned_to == user_id)
    )
    assigned_tasks = assigned_tasks_result.scalars().all()
    for task in assigned_tasks:
        task.assigned_to = None

    # Clear this user's department-scope and extra-assignable-role links
    await db.execute(user_managed_department.delete().where(user_managed_department.c.user_id == user_id))
    await db.execute(user_extra_assignable_role.delete().where(user_extra_assignable_role.c.user_id == user_id))

    # Users who reported to this user no longer have a manager
    reports_to_result = await db.execute(select(User).where(User.manager_id == user_id))
    for report in reports_to_result.scalars().all():
        report.manager_id = None

    await db.delete(user)
    await db.commit()


@router.patch("/{user_id}/department", response_model=UserOut)
async def assign_department(
    user_id: int,
    payload: AssignDepartmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Assign a user to a department. Mirrors the assign_role endpoint pattern.
    Validates the department exists if not null, sets user.department_id,
    and returns the user with both role and department eager-loaded.
    """
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Department-tier users can only edit users in their scoped departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    department = None
    if payload.department_id is None:
        if scoped_dept_ids is not None:
            raise HTTPException(status_code=403, detail="You cannot remove a user from your departments")
        user.department_id = None
    else:
        if scoped_dept_ids is not None and payload.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=403, detail="You can only assign users to departments you manage")
        dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
        department = dept_result.scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=404, detail="Department not found")
        user.department_id = department.id

    await log_activity(db, current_user.id, "department_assigned", "user", user_id, detail=f"Department changed to '{department.name}'" if department else "Department removed")
    await db.commit()

    db.expire_all()
    return await _load_user_out(db, user_id)

@router.get("/{user_id}/activity", response_model=list[ActivityLogOut])
async def get_user_activity(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")

    target_result = await db.execute(select(User).where(User.id == user_id))
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if target_user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    logs_result = await db.execute(
        select(ActivityLog)
        .where(
            (ActivityLog.actor_id == user_id) |
            ((ActivityLog.entity_type == "user") & (ActivityLog.entity_id == user_id))
        )
        .order_by(ActivityLog.created_at.desc())
    )
    return logs_result.scalars().all()

@router.post("/{user_id}/avatar", response_model=UserOut)
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="Not allowed to change this user's picture")

    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG, WEBP, or GIF)")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 2MB")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete old avatar file if one exists, before saving the new one
    if user.avatar_path and os.path.exists(user.avatar_path):
        os.remove(user.avatar_path)

    avatar_dir = os.path.join(UPLOAD_DIR, "avatars", str(user_id))
    os.makedirs(avatar_dir, exist_ok=True)
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    stored_path = os.path.join(avatar_dir, stored_name)

    with open(stored_path, "wb") as f:
        f.write(content)

    user.avatar_path = stored_path
    await db.commit()
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User)
        .options(*user_load_options())
        .where(User.id == user.id)
    )
    return result.scalar_one()

@router.delete("/{user_id}/avatar", response_model=UserOut)
async def delete_avatar(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="Not allowed to change this user's picture")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.avatar_path and os.path.exists(user.avatar_path):
        os.remove(user.avatar_path)
    user.avatar_path = None

    await db.commit()
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User)
        .options(*user_load_options())
        .where(User.id == user.id)
    )
    return result.scalar_one()

@router.get("/{user_id}/avatar")
async def get_avatar(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.avatar_path or not os.path.exists(user.avatar_path):
        raise HTTPException(status_code=404, detail="No avatar found")
    return FileResponse(user.avatar_path)
