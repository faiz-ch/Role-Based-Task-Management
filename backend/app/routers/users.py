from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user, has_permission, get_scoped_department_ids
from app.core.security import hash_password
from app.database import get_db
from app.models.user import User
from app.models.role import Role
from app.models.department import Department
from app.models.task import Task
from app.models.project import Project, ProjectTeam
from app.models.subtask import SubTask, SubTaskAssignee
from app.models.report import Report
from app.models.attachment import Attachment
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.schemas.user import UserOut, UserUpdate, AssignRoleRequest, AssignDepartmentRequest, UserCreate
from app.services import notification_dispatch

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User list access is now scoped based on user:view permissions."""
    if not has_permission(current_user, "user:view"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")
    
    query = select(User).options(selectinload(User.role).selectinload(Role.permissions),
        selectinload(User.role).selectinload(Role.departments),
        selectinload(User.role).selectinload(Role.assignable_roles),
        selectinload(User.department))
    
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if not scoped_dept_ids:
            return []  # Empty scope = no users visible
        query = query.where(User.department_id.in_(scoped_dept_ids))
    
    result = await db.execute(query)
    return result.scalars().all()


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

    scoped_dept_ids = get_scoped_department_ids(current_user)
    
    # Apply department-tier guardrails
    if scoped_dept_ids is not None:
        if not scoped_dept_ids:
            raise HTTPException(
                status_code=403,
                detail="You cannot create users because your role has no departments assigned"
            )
        final_department_id = payload.department_id if payload.department_id in scoped_dept_ids else list(scoped_dept_ids)[0]
    else:
        final_department_id = payload.department_id
    
    # Validate role is assignable based on role's assignable_roles
    if payload.role_id is not None:
        role_result = await db.execute(
            select(Role).where(Role.id == payload.role_id)
        )
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")

        # Check if this role is in the current user's role's assignable list
        if current_user.role is None:
            raise HTTPException(
                status_code=403,
                detail="You cannot assign roles because you have no role"
            )
        assignable_role_ids = {r.id for r in current_user.role.assignable_roles}
        if role.id not in assignable_role_ids:
            raise HTTPException(
                status_code=403,
                detail="You are not allowed to assign this role"
            )

    if final_department_id is not None:
        dept_result = await db.execute(select(Department).where(Department.id == final_department_id))
        if dept_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department not found")

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        department_id=final_department_id,
    )
    db.add(user)
    await db.commit()
    
    background_tasks.add_task(notification_dispatch.notify_user_created, user.id)
    
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions),
        selectinload(User.role).selectinload(Role.departments),
        selectinload(User.role).selectinload(Role.assignable_roles),
        selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Any logged-in user can see their own profile — no special permission needed."""
    return current_user


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
        .options(selectinload(User.role).selectinload(Role.permissions),
        selectinload(User.role).selectinload(Role.departments),
        selectinload(User.role).selectinload(Role.assignable_roles),
        selectinload(User.department))
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
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Department-tier users can only edit users in their scoped departments
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if user.department_id not in scoped_dept_ids:
            raise HTTPException(status_code=404, detail="User not found")

    # Capture old values for comparison
    old_name = user.name
    old_email = user.email
    old_is_active = user.is_active

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        # Check if email is already in use by another user
        existing = await db.execute(
            select(User).where(User.email == payload.email, User.id != user_id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = payload.email
    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.department_id is not None:
        # Apply department-tier guardrail
        if scoped_dept_ids is not None:
            if not scoped_dept_ids:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot change department because your role has no departments assigned"
                )
            if payload.department_id != 0 and payload.department_id not in scoped_dept_ids:
                raise HTTPException(
                    status_code=403,
                    detail="You can only assign users to your role's departments"
                )
        # Validate department exists if not null
        if payload.department_id != 0:  # 0 or null means unassigned
            dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
            if dept_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Department not found")
        user.department_id = payload.department_id if payload.department_id != 0 else None

    await db.commit()

    # Send notifications for changed fields
    if payload.name is not None and payload.name != old_name:
        background_tasks.add_task(notification_dispatch.notify_user_name_changed, user.id)
    if payload.email is not None and payload.email != old_email:
        background_tasks.add_task(notification_dispatch.notify_user_email_changed, user.id)
    if payload.password is not None:
        background_tasks.add_task(notification_dispatch.notify_user_password_changed, user.id)
    if payload.is_active is not None and old_is_active == True and payload.is_active == False:
        background_tasks.add_task(notification_dispatch.notify_user_deactivated, user.id)

    result = await db.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions),
        selectinload(User.role).selectinload(Role.departments),
        selectinload(User.role).selectinload(Role.assignable_roles),
        selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()


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

    if payload.role_id is None:
        user.role_id = None
    else:
        role_result = await db.execute(
            select(Role).where(Role.id == payload.role_id)
        )
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")

        # Apply role-based guardrail - check assignable_roles
        if current_user.role is None:
            raise HTTPException(
                status_code=403,
                detail="You cannot assign roles because you have no role"
            )
        assignable_role_ids = {r.id for r in current_user.role.assignable_roles}
        if role.id not in assignable_role_ids:
            raise HTTPException(
                status_code=403,
                detail="You are not allowed to assign this role"
            )

        user.role_id = role.id

    await db.commit()
    result = await db.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions),
        selectinload(User.role).selectinload(Role.departments),
        selectinload(User.role).selectinload(Role.assignable_roles),
        selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()


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

    if payload.department_id is None:
        user.department_id = None
    else:
        # Apply department-tier guardrail
        if scoped_dept_ids is not None:
            if not scoped_dept_ids:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot assign departments because your role has no departments assigned"
                )
            if payload.department_id not in scoped_dept_ids:
                raise HTTPException(
                    status_code=403,
                    detail="You can only assign users to your role's departments"
                )
        
        dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
        department = dept_result.scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=404, detail="Department not found")
        user.department_id = department.id

    await db.commit()
    result = await db.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions),
        selectinload(User.role).selectinload(Role.departments),
        selectinload(User.role).selectinload(Role.assignable_roles),
        selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()