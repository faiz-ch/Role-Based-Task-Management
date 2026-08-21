import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    require_permission,
    get_current_user,
    has_permission,
    get_scoped_department_ids,
    is_project_lead,
    can_manage_project,
    get_assignable_user_pool,
)
from app.database import get_db
from app.models.project import Project, ProjectStatus, ProjectTeam, project_department
from app.models.department import Department
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.attachment import Attachment
from app.models.role import Role
from app.models.report import Report
from app.models.activity_log import ActivityLog
from app.schemas.project import ProjectCreate, ProjectOut, ProjectTeamUpdate, ProjectUpdate, ProjectRejectRequest, LeadOut, TeamMemberOut
from app.schemas.user import UserOut
from app.schemas.report import ReportCreate, ReportOut
from app.schemas.activity_log import ActivityLogOut
from app.services import notification_dispatch
from app.services.activity_log import log_activity

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("project:manage")),
):
    # Validate all department_ids exist
    dept_result = await db.execute(
        select(Department).where(Department.id.in_(payload.department_ids))
    )
    departments = dept_result.scalars().all()
    if len(departments) != len(payload.department_ids):
        raise HTTPException(status_code=400, detail="One or more departments not found")

    # Check department scope authorization
    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is not None:
        if not scoped_dept_ids:
            raise HTTPException(
                status_code=403,
                detail="You cannot create projects because your role has no departments assigned."
            )
        out_of_scope = [dept_id for dept_id in payload.department_ids if dept_id not in scoped_dept_ids]
        if out_of_scope:
            raise HTTPException(
                status_code=403,
                detail=f"The following department_ids are outside your scope: {out_of_scope}"
            )

    # Validate due date is not in the past
    if payload.due_date:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        # Ensure payload.due_date is timezone-aware
        if payload.due_date.tzinfo is None:
            due_date = payload.due_date.replace(tzinfo=timezone.utc)
        else:
            due_date = payload.due_date
        if due_date < today:
            raise HTTPException(
                status_code=400,
                detail="Due date cannot be before today"
            )

    # Validate start date is not in the past
    if payload.start_date:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        # Ensure payload.start_date is timezone-aware
        if payload.start_date.tzinfo is None:
            start_date = payload.start_date.replace(tzinfo=timezone.utc)
        else:
            start_date = payload.start_date
        if start_date < today:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be before today"
            )

    # Create project
    project = Project(
        name=payload.name,
        description=payload.description,
        priority=payload.priority,
        start_date=payload.start_date,
        due_date=payload.due_date,
        color=payload.color,
        status=ProjectStatus.PLANNING,
        created_by=current_user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    await log_activity(db, current_user.id, "project_created", "project", project.id, detail=payload.name)

    # Insert project_department associations
    for dept_id in payload.department_ids:
        await db.execute(
            project_department.insert().values(project_id=project.id, department_id=dept_id)
        )
    await db.commit()
    await db.refresh(project)

    # Handle lead_id and team_user_ids if provided
    if payload.lead_id is not None or payload.team_user_ids is not None:
        await _validate_and_set_project_team(
            db, 
            project, 
            payload.lead_id, 
            payload.team_user_ids or [], 
            current_user
        )

    # Load relationships for response
    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.project import ProjectStatus

    # Load all projects with relationships
    query = select(Project).options(
        selectinload(Project.departments),
        selectinload(Project.team_members).selectinload(ProjectTeam.user),
        selectinload(Project.lead),
    )
    result = await db.execute(query)
    projects = result.scalars().all()

    if has_permission(current_user, "project:view") or has_permission(current_user, "project:manage"):
        # Filter by department scope
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is not None:
            # Filter to projects in scoped departments
            visible_projects = [
                p for p in projects
                if any(d.id in scoped_dept_ids for d in p.departments)
            ]
        else:
            # Global scope - see all projects
            visible_projects = list(projects)
    else:
        # No project:view permission - only see projects where user is lead or team member
        visible_projects = [
            p for p in projects
            if p.lead_id == current_user.id
            or any(tm.user_id == current_user.id for tm in p.team_members)
        ]

    return [_project_to_out(p) for p in visible_projects]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Check access permissions
    has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
    in_scope = False
    if has_view_perm:
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
            in_scope = True

    is_lead = is_project_lead(current_user, project)
    is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

    if not (in_scope or is_lead or is_team_member):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    return _project_to_out(project)


@router.get("/{project_id}/activity", response_model=list[ActivityLogOut])
async def get_project_activity(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity log for a project. Uses same view permission as get_project."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Check access permissions (same as get_project)
    has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
    in_scope = False
    if has_view_perm:
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
            in_scope = True

    is_lead = is_project_lead(current_user, project)
    is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

    if not (in_scope or is_lead or is_team_member):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    # Load activity logs for this project
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.entity_type == "project", ActivityLog.entity_id == project_id)
        .order_by(ActivityLog.created_at.desc())
    )
    logs = result.scalars().all()
    return logs


@router.get("/{project_id}/candidates", response_model=list[UserOut])
async def get_project_candidates(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Check access permissions (same as get_project)
    has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
    in_scope = False
    if has_view_perm:
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
            in_scope = True

    is_lead = is_project_lead(current_user, project)
    is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

    # Check if user is lead of any task in this project
    task_lead_result = await db.execute(
        select(Task.id).where(Task.project_id == project_id, Task.lead_id == current_user.id).limit(1)
    )
    is_task_lead_of_something = task_lead_result.scalar_one_or_none() is not None

    if not (in_scope or is_lead or is_team_member or is_task_lead_of_something):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    # Get candidate users from project's departments
    project_dept_ids = {d.id for d in project.departments}
    from app.models.category import Category
    candidates_result = await db.execute(
        select(User).options(
            selectinload(User.role)
            .selectinload(Role.category)
            .selectinload(Category.permissions),
            selectinload(User.role).selectinload(Role.departments),
            selectinload(User.role).selectinload(Role.permissions),
            selectinload(User.role).selectinload(Role.assignable_roles),
        ).where(User.department_id.in_(project_dept_ids))
    )
    candidates = candidates_result.scalars().all()

    # Filter through assignable categories
    assignable_pool = get_assignable_user_pool(
        list(candidates), project_dept_ids
    )

    # Return as UserOut
    return [UserOut.model_validate(u) for u in assignable_pool]


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("project:manage")),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Verify manager's department scope covers this project
    scoped_dept_ids = get_scoped_department_ids(current_user)
    project_dept_ids = {d.id for d in project.departments}
    if scoped_dept_ids is not None and not (project_dept_ids & scoped_dept_ids):
        raise HTTPException(status_code=403, detail="This project is outside your department scope")

    # Validate due date is not in the past
    if payload.due_date is not None:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        # Ensure payload.due_date is timezone-aware
        if payload.due_date.tzinfo is None:
            due_date = payload.due_date.replace(tzinfo=timezone.utc)
        else:
            due_date = payload.due_date
        if due_date < today:
            raise HTTPException(
                status_code=400,
                detail="Due date cannot be before today"
            )

    # Validate start date is not in the past
    if payload.start_date is not None:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        # Ensure payload.start_date is timezone-aware
        if payload.start_date.tzinfo is None:
            start_date = payload.start_date.replace(tzinfo=timezone.utc)
        else:
            start_date = payload.start_date
        if start_date < today:
            raise HTTPException(
                status_code=400,
                detail="Start date cannot be before today"
            )

    # Apply provided fields
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.priority is not None:
        project.priority = payload.priority
    if payload.start_date is not None:
        project.start_date = payload.start_date
    if payload.due_date is not None:
        project.due_date = payload.due_date
    if payload.color is not None:
        project.color = payload.color

    # If department_ids is provided, validate and replace
    if payload.department_ids is not None:
        # Validate all department_ids exist
        dept_result = await db.execute(
            select(Department).where(Department.id.in_(payload.department_ids))
        )
        departments = dept_result.scalars().all()
        if len(departments) != len(payload.department_ids):
            raise HTTPException(status_code=400, detail="One or more departments not found")

        # Delete existing project_department associations
        await db.execute(
            delete(project_department).where(project_department.c.project_id == project_id)
        )

        # Insert new project_department associations
        for dept_id in payload.department_ids:
            await db.execute(
                project_department.insert().values(project_id=project_id, department_id=dept_id)
            )

    await db.commit()
    await db.refresh(project)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.patch("/{project_id}/complete", response_model=ProjectOut)
async def send_project_for_approval(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a project for approval. Only the project lead or users with project:manage permission can do this."""
    from sqlalchemy.orm import selectinload
    project = await _get_project_or_404_with_loads(db, project_id)

    # Only the project lead or users with project:manage permission can send for approval
    if current_user.id != project.lead_id and not has_permission(current_user, "project:manage"):
        raise HTTPException(
            status_code=403,
            detail="Only the project lead or users with project:manage permission can send for approval"
        )

    # Check if all tasks are DONE
    tasks_result = await db.execute(
        select(Task).where(Task.project_id == project_id)
    )
    tasks = tasks_result.scalars().all()
    for task in tasks:
        if task.status != TaskStatus.DONE:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot send for approval: task '{task.title}' is not yet done (status: {task.status.value})"
            )

    # Check if project is Active
    if project.status != ProjectStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Project must be Active to send for approval"
        )

    # Mark project as PENDING_APPROVAL
    project.status = ProjectStatus.PENDING_APPROVAL
    await log_activity(db, current_user.id, "project_sent_for_approval", "project", project.id, detail="Active -> Pending Approval")
    await db.commit()
    await db.refresh(project)

    background_tasks.add_task(notification_dispatch.notify_project_pending_approval, project.id)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.patch("/{project_id}/approve", response_model=ProjectOut)
async def approve_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a project pending approval. Only users with project:manage permission can do this."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Permission check: only users with project:manage permission can approve
    if not has_permission(current_user, "project:manage"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to approve projects"
        )

    # Check if project is pending approval
    if project.status != ProjectStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail="Project is not pending approval"
        )

    # Mark project as DONE
    project.status = ProjectStatus.DONE
    project.completed_at = datetime.now(timezone.utc)
    await log_activity(db, current_user.id, "project_completed", "project", project.id, detail="Pending Approval -> Done (approved)")
    await db.commit()
    await db.refresh(project)

    background_tasks.add_task(notification_dispatch.notify_project_completed, project.id)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.patch("/{project_id}/reject", response_model=ProjectOut)
async def reject_project(
    project_id: int,
    payload: ProjectRejectRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a project pending approval, sending it back to Active. Requires a reason. Only users with project:manage permission can do this."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Permission check: only users with project:manage permission can reject
    if not has_permission(current_user, "project:manage"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to reject projects"
        )

    # Check if project is pending approval
    if project.status != ProjectStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail="Project is not pending approval"
        )

    # Require a reason
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(
            status_code=400,
            detail="A reason is required to reject a project"
        )

    # Mark project as ACTIVE
    project.status = ProjectStatus.ACTIVE
    await log_activity(db, current_user.id, "project_rejected", "project", project.id, detail=f"Pending Approval -> Active (rejected: {payload.reason.strip()})")
    await db.commit()
    await db.refresh(project)

    background_tasks.add_task(notification_dispatch.notify_project_rejected, project.id, payload.reason.strip())

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


class ProjectCloseRequest(BaseModel):
    closing_notes: str | None = None


@router.patch("/{project_id}/close", response_model=ProjectOut)
async def close_project(
    project_id: int,
    payload: ProjectCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close a completed project (set status to Archived). Only when project is Done. Requires project:manage permission."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Permission check: only users with project:manage permission can close
    if not has_permission(current_user, "project:manage"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to close projects"
        )

    # Check if project is Done
    if project.status != ProjectStatus.DONE:
        raise HTTPException(
            status_code=400,
            detail="Project must be Done to close"
        )

    # Check if all tasks are DONE
    tasks_result = await db.execute(
        select(Task).where(Task.project_id == project_id)
    )
    tasks = tasks_result.scalars().all()
    incomplete_tasks = [task for task in tasks if task.status != TaskStatus.DONE]
    if incomplete_tasks:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot close project: {len(incomplete_tasks)} task(s) are not yet done"
        )

    # Mark project as ARCHIVED
    project.status = ProjectStatus.ARCHIVED
    project.closing_notes = payload.closing_notes
    await log_activity(db, current_user.id, "project_closed", "project", project.id, detail="Done -> Archived")
    await db.commit()
    await db.refresh(project)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


class ProjectReopenRequest(BaseModel):
    reason: str


@router.patch("/{project_id}/reopen", response_model=ProjectOut)
async def reopen_project(
    project_id: int,
    payload: ProjectReopenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reopen an archived project (set status back to Active). Only when project is Archived. Requires project:manage permission."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Permission check: only users with project:manage permission can reopen
    if not has_permission(current_user, "project:manage"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to reopen projects"
        )

    # Check if project is Archived
    if project.status != ProjectStatus.ARCHIVED:
        raise HTTPException(
            status_code=400,
            detail="Project must be Archived to reopen"
        )

    # Require a reason
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(
            status_code=400,
            detail="A reason is required to reopen a project"
        )

    # Mark project as ACTIVE
    project.status = ProjectStatus.ACTIVE
    project.reopened_reason = payload.reason.strip()
    project.reopened_by = current_user.id
    project.reopened_at = datetime.now(timezone.utc)
    await log_activity(db, current_user.id, "project_reopened", "project", project.id, detail=f"Archived -> Active (reason: {payload.reason.strip()})")
    await db.commit()
    await db.refresh(project)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("project:manage")),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Verify manager's department scope covers this project
    scoped_dept_ids = get_scoped_department_ids(current_user)
    project_dept_ids = {d.id for d in project.departments}
    if scoped_dept_ids is not None and not (project_dept_ids & scoped_dept_ids):
        raise HTTPException(status_code=403, detail="This project is outside your department scope")

    # Delete attachments for this project's tasks first (no DB-level cascade for attachments)
    task_ids_subquery = select(Task.id).where(Task.project_id == project_id)
    attachments_result = await db.execute(select(Attachment).where(Attachment.task_id.in_(task_ids_subquery)))
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

    # Delete the project's tasks (subtasks cascade at the DB level via ondelete=CASCADE)
    await db.execute(delete(Task).where(Task.project_id == project_id))

    # Delete the project
    await db.execute(delete(Project).where(Project.id == project_id))

    await log_activity(db, current_user.id, "project_deleted", "project", project_id, detail=project.name)
    await db.commit()


@router.put("/{project_id}/team", response_model=ProjectOut)
async def update_project_team(
    project_id: int,
    payload: ProjectTeamUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("project:manage")),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Verify manager's department scope covers this project
    scoped_dept_ids = get_scoped_department_ids(current_user)
    project_dept_ids = {d.id for d in project.departments}
    if scoped_dept_ids is not None and not (project_dept_ids & scoped_dept_ids):
        raise HTTPException(status_code=403, detail="This project is outside your department scope")

    # Get candidate pool: users in project's departments
    from app.models.category import Category
    candidates_result = await db.execute(
        select(User).options(
            selectinload(User.role)
            .selectinload(Role.category)
            .selectinload(Category.permissions),
            selectinload(User.role).selectinload(Role.departments),
            selectinload(User.role).selectinload(Role.permissions),
            selectinload(User.role).selectinload(Role.assignable_roles),
        ).where(User.department_id.in_(project_dept_ids))
    )
    candidates = candidates_result.scalars().all()

    # Filter through assignable categories
    assignable_pool = get_assignable_user_pool(
        list(candidates), project_dept_ids
    )
    assignable_user_ids = {u.id for u in assignable_pool}

    # Validate all requested user_ids are in the filtered pool
    for user_id in payload.user_ids:
        if user_id not in assignable_user_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User {user_id} is not in your assignable pool for this project"
            )

    # If lead_id is provided, validate it's in assignable pool and has required permissions
    if payload.lead_id is not None:
        if payload.lead_id not in assignable_user_ids:
            raise HTTPException(
                status_code=400,
                detail="Lead is not in your assignable pool for this project"
            )
        # Load the lead user with their role and permissions to check eligibility
        lead_user_result = await db.execute(
            select(User).options(
                selectinload(User.role).selectinload(Role.permissions)
            ).where(User.id == payload.lead_id)
        )
        lead_user = lead_user_result.scalar_one_or_none()
        if lead_user is None or lead_user.role is None:
            raise HTTPException(
                status_code=400,
                detail="Lead user not found or has no role assigned"
            )
        # Check if lead has either task:manage or task:create permission
        lead_permissions = {p.name for p in lead_user.role.permissions}
        if "task:manage" not in lead_permissions and "task:create" not in lead_permissions:
            raise HTTPException(
                status_code=400,
                detail="Lead must have either task:manage or task:create permission"
            )

    # Delete existing team members
    await db.execute(
        delete(ProjectTeam).where(ProjectTeam.project_id == project_id)
    )

    # Insert new team members
    for user_id in payload.user_ids:
        team_member = ProjectTeam(
            project_id=project_id,
            user_id=user_id,
            added_by=current_user.id,
        )
        db.add(team_member)

    # Set lead_id if provided
    if payload.lead_id is not None:
        project.lead_id = payload.lead_id

    # Set assignment markers (reusing approval columns)
    project.team_approved_by = current_user.id
    project.team_approved_at = datetime.now(timezone.utc)

    # Transition from Planning to Active if applicable
    if project.status == ProjectStatus.PLANNING:
        project.status = ProjectStatus.ACTIVE

    await db.commit()
    await db.refresh(project)

    background_tasks.add_task(notification_dispatch.notify_project_team_assigned, project.id, payload.lead_id or 0, payload.user_ids)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.post("/{project_id}/reports", response_model=ReportOut, status_code=201)
async def create_project_report(
    project_id: int,
    payload: ReportCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update a report for a project. Only the project lead can create reports."""
    project = await _get_project_or_404_with_loads(db, project_id)

    if not is_project_lead(current_user, project):
        raise HTTPException(status_code=403, detail="Only the project lead can create reports")

    # Check for existing report for this project
    existing_report_result = await db.execute(
        select(Report).where(Report.project_id == project_id)
    )
    existing_report = existing_report_result.scalar_one_or_none()

    if existing_report:
        # Update existing report
        existing_report.content = payload.content
        await db.commit()
        await db.refresh(existing_report)
        report = existing_report
    else:
        # Create new report
        report = Report(
            project_id=project_id,
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


@router.get("/{project_id}/reports", response_model=list[ReportOut])
async def list_project_reports(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reports for a project. Anyone who can view the project can view its reports."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Check access permissions (same as get_project)
    has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
    in_scope = False
    if has_view_perm:
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
            in_scope = True

    is_lead = is_project_lead(current_user, project)
    is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

    if not (in_scope or is_lead or is_team_member):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    # Load reports with author, newest first
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.author))
        .where(Report.project_id == project_id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()

    return [_report_to_out(r) for r in reports]


async def _validate_and_set_project_team(
    db: AsyncSession,
    project: Project,
    lead_id: int | None,
    user_ids: list[int],
    current_user: User
):
    """Validate and set project team (lead and members). Reuses validation logic from update_project_team."""
    # Query department_ids directly from the join table to avoid lazy-loading the relationship
    from app.models.project import project_department
    dept_ids_result = await db.execute(
        select(project_department.c.department_id).where(project_department.c.project_id == project.id)
    )
    project_dept_ids = {row[0] for row in dept_ids_result}

    # Get candidate pool: users in project's departments
    from app.models.category import Category
    candidates_result = await db.execute(
        select(User).options(
            selectinload(User.role)
            .selectinload(Role.category)
            .selectinload(Category.permissions),
            selectinload(User.role).selectinload(Role.departments),
            selectinload(User.role).selectinload(Role.permissions),
            selectinload(User.role).selectinload(Role.assignable_roles),
        ).where(User.department_id.in_(project_dept_ids))
    )
    candidates = candidates_result.scalars().all()

    # Filter through assignable categories
    assignable_pool = get_assignable_user_pool(
        list(candidates), project_dept_ids
    )
    assignable_user_ids = {u.id for u in assignable_pool}

    # Validate all requested user_ids are in the filtered pool
    for user_id in user_ids:
        if user_id not in assignable_user_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User {user_id} is not in your assignable pool for this project"
            )

    # If lead_id is provided, validate it's in assignable pool and has required permissions
    if lead_id is not None:
        if lead_id not in assignable_user_ids:
            raise HTTPException(
                status_code=400,
                detail="Lead is not in your assignable pool for this project"
            )
        # Load the lead user with their role and permissions to check eligibility
        lead_user_result = await db.execute(
            select(User).options(
                selectinload(User.role).selectinload(Role.permissions)
            ).where(User.id == lead_id)
        )
        lead_user = lead_user_result.scalar_one_or_none()
        if lead_user is None or lead_user.role is None:
            raise HTTPException(
                status_code=400,
                detail="Lead user not found or has no role assigned"
            )
        # Check if lead has either task:manage or task:create permission
        lead_permissions = {p.name for p in lead_user.role.permissions}
        if "task:manage" not in lead_permissions and "task:create" not in lead_permissions:
            raise HTTPException(
                status_code=400,
                detail="Lead must have either task:manage or task:create permission"
            )

    # Insert team members
    for user_id in user_ids:
        team_member = ProjectTeam(
            project_id=project.id,
            user_id=user_id,
            added_by=current_user.id,
        )
        db.add(team_member)

    # Set lead_id if provided
    if lead_id is not None:
        project.lead_id = lead_id

    # Set assignment markers (reusing approval columns)
    project.team_approved_by = current_user.id
    project.team_approved_at = datetime.now(timezone.utc)

    # Transition from Planning to Active if applicable
    if project.status == ProjectStatus.PLANNING:
        project.status = ProjectStatus.ACTIVE

    await db.commit()
    await db.refresh(project)


async def _get_project_or_404(db: AsyncSession, project_id: int) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_project_or_404_with_loads(db: AsyncSession, project_id: int) -> Project:
    """Load project with relationships needed for authorization and response."""
    result = await db.execute(
        select(Project).options(
            selectinload(Project.departments),
            selectinload(Project.team_members).selectinload(ProjectTeam.user),
            selectinload(Project.lead),
        ).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_project_with_loads(db: AsyncSession, project_id: int) -> Project:
    """Load project with relationships for response."""
    return await _get_project_or_404_with_loads(db, project_id)


def _project_to_out(project: Project) -> ProjectOut:
    """Convert Project model to ProjectOut schema."""
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status.value,
        priority=project.priority.value,
        start_date=project.start_date,
        due_date=project.due_date,
        color=project.color,
        created_by=project.created_by,
        lead_id=project.lead_id,
        lead=LeadOut.model_validate(project.lead) if project.lead else None,
        team_approved_by=project.team_approved_by,
        team_approved_at=project.team_approved_at,
        created_at=project.created_at,
        completed_at=project.completed_at,
        department_ids=[d.id for d in project.departments],
        team_user_ids=[tm.user_id for tm in project.team_members],
        team_members=[
            TeamMemberOut(id=tm.user.id, name=tm.user.name)
            for tm in project.team_members if tm.user
        ],
        closing_notes=project.closing_notes,
        reopened_reason=project.reopened_reason,
        reopened_by=project.reopened_by,
        reopened_at=project.reopened_at,
    )


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
