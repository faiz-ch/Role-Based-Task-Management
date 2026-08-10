from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user, get_scoped_department_ids
from app.database import get_db
from app.models.department import Department
from app.models.user import User
from app.models.project import Project, project_department
from app.models.role import role_department
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


async def _department_to_out(db: AsyncSession, department: Department) -> DepartmentOut:
    """Convert Department model to DepartmentOut schema with counts and loaded relationships."""
    # Load head relationship
    await db.refresh(department, ["head", "projects"])

    # Count members (users where User.department_id == department.id)
    member_count_result = await db.execute(
        select(User).where(User.department_id == department.id)
    )
    member_count = len(member_count_result.scalars().all())

    # Count projects via the secondary relationship
    project_count = len(department.projects)

    # Build head output if exists
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
    )


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List departments, scoped to the caller's own department(s) unless they hold all_departments."""
    result = await db.execute(
        select(Department).options(selectinload(Department.head))
    )
    departments = result.scalars().all()

    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is None:
        filtered_departments = departments
    elif not scoped_dept_ids:
        return []
    else:
        filtered_departments = [d for d in departments if d.id in scoped_dept_ids]

    # Build DepartmentOut for each with counts
    out_list = []
    for dept in filtered_departments:
        out_list.append(await _department_to_out(db, dept))
    return out_list


@router.get("/{department_id}", response_model=DepartmentOut)
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("department:manage")),
):
    """Get a single department by ID. Requires department:manage permission."""
    result = await db.execute(
        select(Department).options(selectinload(Department.head)).where(Department.id == department_id)
    )
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    return await _department_to_out(db, department)


@router.get("/{department_id}/activity", response_model=list[ActivityLogOut])
async def get_department_activity(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("department:manage")),
):
    """Get activity log for a department. Requires department:manage."""
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
    current_user: User = Depends(require_permission("department:manage")),
):
    """Create a new department. Requires department:manage permission."""
    existing = await db.execute(select(Department).where(Department.name == payload.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Department name already exists")

    # Validate head_id if provided
    if payload.head_id is not None:
        head_result = await db.execute(select(User).where(User.id == payload.head_id))
        if head_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department head user not found")

    department = Department(
        name=payload.name,
        description=payload.description,
        head_id=payload.head_id,
        color=payload.color,
        is_active=payload.is_active,
    )
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
    current_user: User = Depends(require_permission("department:manage")),
):
    """Update a department. Requires department:manage permission."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    # Track changed fields for activity log
    changed_fields = []

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
    current_user: User = Depends(require_permission("department:manage")),
):
    """
    Delete a department. Requires department:manage permission.
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
        # Reassign users
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

    # Clear role_department associations for this department
    await db.execute(role_department.delete().where(role_department.c.department_id == department_id))

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
