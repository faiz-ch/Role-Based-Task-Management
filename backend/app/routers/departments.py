from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user, get_scoped_department_ids, has_permission
from app.models.organization import Station, station_department
from app.database import get_db
from app.models.department import Department
from app.models.user import User
from app.models.project import Project, project_department
from app.models.user import user_managed_department
from app.models.role import Role
from app.models.activity_log import ActivityLog
from app.schemas.department import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    DepartmentDeleteRequest,
)
from app.schemas.activity_log import ActivityLogOut
from app.services.activity_log import log_activity

router = APIRouter(prefix="/departments", tags=["departments"])


def _build_department_out(department: Department, member_count: int, project_count: int) -> DepartmentOut:
    """Build DepartmentOut from an already-loaded department. Makes NO database calls."""
    head_out = None
    if department.head:
        head_out = {
            "id": department.head.id,
            "name": department.head.name,
            "email": department.head.email,
        }
    return DepartmentOut(
        id=department.id,
        name=department.name,
        description=department.description,
        head_id=department.head_id,
        head=head_out,
        color=department.color,
        is_active=department.is_active,
        member_count=member_count,
        project_count=project_count,
        created_at=department.created_at,
        stations=[{"id": st.id, "name": st.name, "code": st.code} for st in department.stations],
    )


async def _department_counts(db: AsyncSession, dept_ids: list[int]) -> tuple[dict[int, int], dict[int, int]]:
    """
    Member and project counts for MANY departments, counted inside the
    database with two grouped queries (instead of loading every row).
    """
    if not dept_ids:
        return {}, {}
    members = dict((await db.execute(
        select(User.department_id, func.count(User.id))
        .where(User.department_id.in_(dept_ids))
        .group_by(User.department_id)
    )).all())
    projects = dict((await db.execute(
        select(project_department.c.department_id, func.count(project_department.c.project_id))
        .where(project_department.c.department_id.in_(dept_ids))
        .group_by(project_department.c.department_id)
    )).all())
    return members, projects


async def _department_to_out(db: AsyncSession, department: Department) -> DepartmentOut:
    """DepartmentOut for ONE department (used after get / create / update)."""
    result = await db.execute(
        select(Department).options(selectinload(Department.head), selectinload(Department.stations))
        .where(Department.id == department.id)
        .execution_options(populate_existing=True)
    )
    department = result.scalar_one()
    members, projects = await _department_counts(db, [department.id])
    return _build_department_out(department, members.get(department.id, 0), projects.get(department.id, 0))


async def _load_stations(db: AsyncSession, station_ids: list[int]) -> list[Station]:
    ids = list(dict.fromkeys(station_ids or []))
    if not ids:
        return []
    found = (await db.execute(select(Station).where(Station.id.in_(ids)))).scalars().all()
    if len(found) != len(ids):
        raise HTTPException(status_code=400, detail="One or more stations do not exist")
    return list(found)


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    station_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List departments. Organization managers see all of them; everyone else sees
    the departments they manage. ?station_id=N returns only that station's departments.
    """
    query = select(Department).options(selectinload(Department.head), selectinload(Department.stations)).order_by(Department.name)
    if station_id is not None:
        query = query.where(Department.id.in_(
            select(station_department.c.department_id).where(station_department.c.station_id == station_id)
        ))
    result = await db.execute(query)
    departments = result.scalars().all()

    scoped_dept_ids = None if has_permission(current_user, "organization:manage") else get_scoped_department_ids(current_user)
    if scoped_dept_ids is None:
        filtered_departments = departments
    elif not scoped_dept_ids:
        return []
    else:
        filtered_departments = [d for d in departments if d.id in scoped_dept_ids]

    # Counts for all departments in two grouped queries
    members, projects = await _department_counts(db, [d.id for d in filtered_departments])
    return [
        _build_department_out(d, members.get(d.id, 0), projects.get(d.id, 0))
        for d in filtered_departments
    ]


@router.get("/{department_id}", response_model=DepartmentOut)
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("organization:manage")),
):
    """Get a single department by ID. Requires organization:manage permission."""
    result = await db.execute(
        select(Department).options(selectinload(Department.head), selectinload(Department.stations)).where(Department.id == department_id)
    )
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    return await _department_to_out(db, department)


@router.get("/{department_id}/activity", response_model=list[ActivityLogOut])
async def get_department_activity(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("organization:manage")),
):
    """Get activity log for a department. Requires organization:manage."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    logs_result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.entity_type == "department", ActivityLog.entity_id == department_id)
        .order_by(ActivityLog.created_at.desc())
    )
    return logs_result.scalars().all()


@router.post("", response_model=DepartmentOut, status_code=201)
async def create_department(
    payload: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("organization:manage")),
):
    """Create a new department. Requires organization:manage permission."""
    existing = await db.execute(select(Department).where(Department.name == payload.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Department name already exists")

    # Validate head_id if provided
    if payload.head_id is not None:
        head_result = await db.execute(select(User).where(User.id == payload.head_id))
        if head_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department head user not found")

    stations = await _load_stations(db, payload.station_ids)
    department = Department(
        name=payload.name,
        description=payload.description,
        head_id=payload.head_id,
        color=payload.color,
        is_active=payload.is_active,
    )
    department.stations = stations
    db.add(department)
    await db.commit()
    await db.refresh(department)

    await log_activity(
        db,
        current_user.id,
        "department_created",
        "department",
        department.id,
        detail=f"Created department '{department.name}'",
    )

    return await _department_to_out(db, department)


@router.patch("/{department_id}", response_model=DepartmentOut)
async def update_department(
    department_id: int,
    payload: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("organization:manage")),
):
    """Update a department. Requires organization:manage permission."""
    result = await db.execute(
        select(Department).options(selectinload(Department.stations)).where(Department.id == department_id)
    )
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    # Track changed fields for activity log
    changed_fields = []
    if payload.station_ids is not None:
        new_stations = await _load_stations(db, payload.station_ids)
        keep = {st.id for st in new_stations}
        for st in department.stations:
            if st.id not in keep:
                n = (await db.execute(select(func.count(User.id)).where(
                    User.department_id == department.id, User.station_id == st.id))).scalar() or 0
                if n:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{n} person(s) work in '{department.name}' at '{st.name}'. Move them first, then remove the station.",
                    )
                from app.routers.organization import _block_if_projects_use, _drop_managed_pair
                await _block_if_projects_use(db, st, department)
                await _drop_managed_pair(db, st.id, department.id)
        department.stations = new_stations
        changed_fields.append("stations")
    if payload.name is not None and payload.name != department.name:
        clash = await db.execute(select(Department.id).where(Department.name == payload.name, Department.id != department_id))
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Department name already exists")

    # Apply only fields that are present (partial update)
    if payload.name is not None:
        department.name = payload.name
        changed_fields.append("name")
    if payload.description is not None:
        department.description = payload.description
        changed_fields.append("description")
    if payload.head_id is not None:
        # Validate the new head user exists
        head_result = await db.execute(select(User).where(User.id == payload.head_id))
        if head_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department head user not found")
        department.head_id = payload.head_id
        changed_fields.append("head")
    if payload.color is not None:
        department.color = payload.color
        changed_fields.append("color")
    if payload.is_active is not None:
        department.is_active = payload.is_active
        changed_fields.append("is_active")

    if not changed_fields:
        # No fields to update
        return await _department_to_out(db, department)

    await db.commit()
    await db.refresh(department)

    # Log activity with detail summarizing changes
    changes_str = ", ".join(changed_fields)
    await log_activity(
        db,
        current_user.id,
        "department_updated",
        "department",
        department.id,
        detail=f"Updated department '{department.name}': {changes_str}",
    )

    return await _department_to_out(db, department)


@router.delete("/{department_id}", status_code=204)
async def delete_department(
    department_id: int,
    payload: DepartmentDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("organization:manage")),
):
    """
    Delete a department. Requires organization:manage permission.
    Accepts move_users_to and move_projects_to to reassign members and projects before deletion.
    """
    result = await db.execute(
        select(Department).options(selectinload(Department.projects)).where(Department.id == department_id)
    )
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    # Count current members
    users_result = await db.execute(select(User).where(User.department_id == department_id))
    users = users_result.scalars().all()
    member_count = len(users)

    # Handle member reassignment
    if member_count > 0:
        if payload.move_users_to is None:
            raise HTTPException(
                status_code=400,
                detail=f"This department has {member_count} members. Provide move_users_to to reassign them before deleting."
            )
        # Verify move_users_to is a real department and not the same as department_id
        target_dept_result = await db.execute(select(Department).where(Department.id == payload.move_users_to))
        target_dept = target_dept_result.scalar_one_or_none()
        if target_dept is None:
            raise HTTPException(status_code=404, detail="Target department for users not found")
        if payload.move_users_to == department_id:
            raise HTTPException(status_code=400, detail="Cannot move users to the same department being deleted")
        # Reassign users. Their placement must stay valid: the new department
        # has to be at each person's station.
        target_station_ids = {st.id for st in (await db.execute(
            select(Station).join(Station.departments).where(Department.id == payload.move_users_to)
        )).scalars().all()}
        stuck = [u.name for u in users if u.station_id is not None and u.station_id not in target_station_ids]
        if stuck:
            raise HTTPException(
                status_code=400,
                detail=f"'{target_dept.name}' is not at the station of: {', '.join(stuck[:5])}"
                       f"{' and others' if len(stuck) > 5 else ''}. Choose a department at their station, or move them first.",
            )
        for user in users:
            user.department_id = payload.move_users_to

    # Handle project reassignment
    project_count = len(department.projects)
    if project_count > 0:
        if payload.move_projects_to is None:
            raise HTTPException(
                status_code=400,
                detail=f"This department has {project_count} projects. Provide move_projects_to to reassign them before deleting."
            )
        # Verify move_projects_to is a real department and not the same as department_id
        target_dept_result = await db.execute(select(Department).where(Department.id == payload.move_projects_to))
        target_dept = target_dept_result.scalar_one_or_none()
        if target_dept is None:
            raise HTTPException(status_code=404, detail="Target department for projects not found")
        if payload.move_projects_to == department_id:
            raise HTTPException(status_code=400, detail="Cannot move projects to the same department being deleted")

        # The new department must be at one of each project's stations
        target_station_ids = {st.id for st in (await db.execute(
            select(Station).join(Station.departments).where(Department.id == payload.move_projects_to)
        )).scalars().all()}
        stuck = [p.name for p in department.projects if p.stations and not ({st.id for st in p.stations} & target_station_ids)]
        if stuck:
            raise HTTPException(
                status_code=400,
                detail=f"'{target_dept.name}' is not at the stations of project(s): {', '.join(stuck[:5])}. Choose another department.",
            )
        # For each project, remove this department and add target department if not already present
        for project in department.projects:
            # Remove this department from the project
            await db.execute(
                project_department.delete().where(
                    project_department.c.project_id == project.id,
                    project_department.c.department_id == department_id,
                )
            )
            # Check if target department is already associated with this project
            existing_assoc = await db.execute(
                select(project_department).where(
                    project_department.c.project_id == project.id,
                    project_department.c.department_id == payload.move_projects_to,
                )
            )
            if existing_assoc.scalar_one_or_none() is None:
                # Add target department to the project
                await db.execute(
                    project_department.insert().values(
                        project_id=project.id, department_id=payload.move_projects_to
                    )
                )

    # Clear user-managed-department associations for this department
    await db.execute(user_managed_department.delete().where(user_managed_department.c.department_id == department_id))
    # Roles tagged to this department become general (untagged) roles
    await db.execute(update(Role).where(Role.department_tag_id == department_id).values(department_tag_id=None))

    # Log activity before deletion
    await log_activity(
        db,
        current_user.id,
        "department_deleted",
        "department",
        department_id,
        detail=f"Deleted department '{department.name}', moved {member_count} users and {project_count} projects",
    )

    # Delete the department
    await db.delete(department)
    await db.commit()
