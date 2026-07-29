import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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
from app.schemas.project import ProjectCreate, ProjectOut, ProjectTeamUpdate, ProjectUpdate
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

    # Create project
    project = Project(
        name=payload.name,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
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
        selectinload(Project.team_members),
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
            selectinload(User.role).selectinload(Role.assignable_categories).selectinload(Category.permissions),
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

    # Apply provided fields
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.priority is not None:
        project.priority = payload.priority
    if payload.due_date is not None:
        project.due_date = payload.due_date

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
async def complete_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a project as complete. Only the project creator can do this."""
    from sqlalchemy.orm import selectinload
    project = await _get_project_or_404_with_loads(db, project_id)

    # Only the project creator can complete it
    if current_user.id != project.created_by:
        raise HTTPException(
            status_code=403,
            detail="Only the project creator can mark it as complete"
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
                detail=f"Cannot complete project: task '{task.title}' is not yet done (status: {task.status.value})"
            )

    # Mark project as DONE
    project.status = ProjectStatus.DONE
    await log_activity(db, current_user.id, "project_completed", "project", project.id, detail="Active -> Done")
    await db.commit()
    await db.refresh(project)

    background_tasks.add_task(notification_dispatch.notify_project_completed, project.id)

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
            selectinload(User.role).selectinload(Role.assignable_categories).selectinload(Category.permissions),
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

    # If lead_id is provided, validate it's in the user_ids list and in assignable pool
    if payload.lead_id is not None:
        if payload.lead_id not in payload.user_ids:
            raise HTTPException(
                status_code=400,
                detail="Lead must be one of the assigned team members"
            )
        if payload.lead_id not in assignable_user_ids:
            raise HTTPException(
                status_code=400,
                detail="Lead is not in your assignable pool for this project"
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a report for a project. Only the project lead can create reports."""
    project = await _get_project_or_404_with_loads(db, project_id)

    if not is_project_lead(current_user, project):
        raise HTTPException(status_code=403, detail="Only the project lead can create reports")

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
            selectinload(Project.team_members),
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
        created_by=project.created_by,
        lead_id=project.lead_id,
        team_approved_by=project.team_approved_by,
        team_approved_at=project.team_approved_at,
        due_date=project.due_date,
        created_at=project.created_at,
        department_ids=[d.id for d in project.departments],
        team_user_ids=[tm.user_id for tm in project.team_members],
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
