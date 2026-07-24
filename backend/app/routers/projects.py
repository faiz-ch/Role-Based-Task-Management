from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
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
from app.schemas.project import ProjectCreate, ProjectOut, ProjectAssignLead, ProjectTeamUpdate

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


@router.patch("/{project_id}/assign-lead", response_model=ProjectOut)
async def assign_project_lead(
    project_id: int,
    payload: ProjectAssignLead,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("project:manage")),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Verify manager's department scope covers this project
    scoped_dept_ids = get_scoped_department_ids(current_user)
    project_dept_ids = {d.id for d in project.departments}
    if scoped_dept_ids is not None and not (project_dept_ids & scoped_dept_ids):
        raise HTTPException(status_code=403, detail="This project is outside your department scope")

    # Validate lead_id belongs to a user in one of the project's departments
    lead_result = await db.execute(
        select(User).where(User.id == payload.lead_id)
    )
    lead = lead_result.scalar_one_or_none()
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead user not found")

    if lead.department_id not in project_dept_ids:
        raise HTTPException(
            status_code=400,
            detail="Lead must belong to one of the project's departments"
        )

    project.lead_id = lead.id
    await db.commit()
    await db.refresh(project)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.put("/{project_id}/team", response_model=ProjectOut)
async def update_project_team(
    project_id: int,
    payload: ProjectTeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404_with_loads(db, project_id)

    # Only the project's own lead can propose a team
    if not is_project_lead(current_user, project):
        raise HTTPException(
            status_code=403,
            detail="Only the project lead can propose team changes"
        )

    # Get candidate pool: users in project's departments
    project_dept_ids = {d.id for d in project.departments}
    candidates_result = await db.execute(
        select(User).where(User.department_id.in_(project_dept_ids))
    )
    candidates = candidates_result.scalars().all()

    # Filter through assignable categories
    assignable_pool = get_assignable_user_pool(
        list(candidates), current_user, project_dept_ids
    )
    assignable_user_ids = {u.id for u in assignable_pool}

    # Validate all requested user_ids are in the filtered pool
    for user_id in payload.user_ids:
        if user_id not in assignable_user_ids:
            raise HTTPException(
                status_code=400,
                detail=f"User {user_id} is not in your assignable pool for this project"
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

    # Reset approval status
    project.team_approved_by = None
    project.team_approved_at = None

    await db.commit()
    await db.refresh(project)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


@router.post("/{project_id}/approve-team", response_model=ProjectOut)
async def approve_project_team(
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

    if not project.team_members:
        raise HTTPException(
            status_code=400,
            detail="Project has no team members to approve"
        )

    project.team_approved_by = current_user.id
    project.team_approved_at = datetime.now(timezone.utc)

    # Transition from Planning to Active if applicable
    if project.status == ProjectStatus.PLANNING:
        project.status = ProjectStatus.ACTIVE

    await db.commit()
    await db.refresh(project)

    project_with_loads = await _get_project_with_loads(db, project.id)
    return _project_to_out(project_with_loads)


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
