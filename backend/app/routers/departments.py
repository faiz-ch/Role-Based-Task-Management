from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user, get_scoped_department_ids
from app.database import get_db
from app.models.department import Department
from app.models.user import User
from app.models.project import Project
from app.models.role import role_department
from app.schemas.department import DepartmentCreate, DepartmentOut

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List departments, scoped to the caller's own department(s) unless they hold all_departments."""
    result = await db.execute(select(Department))
    departments = result.scalars().all()

    scoped_dept_ids = get_scoped_department_ids(current_user)
    if scoped_dept_ids is None:
        return departments
    if not scoped_dept_ids:
        return []
    return [d for d in departments if d.id in scoped_dept_ids]


@router.post("", response_model=DepartmentOut, status_code=201)
async def create_department(
    payload: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("department:manage")),
):
    """Create a new department. Requires department:manage permission."""
    existing = await db.execute(select(Department).where(Department.name == payload.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Department name already exists")

    department = Department(name=payload.name)
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return department


@router.delete("/{department_id}", status_code=204)
async def delete_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("department:manage")),
):
    """
    Delete a department. Requires department:manage permission.
    Blocks deletion if any project would be left with 0 departments as a
    result. Nulls department_id on users pointing to it, then removes it.
    """
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check if any project would be orphaned (have 0 departments after deletion)
    projects_result = await db.execute(
        select(Project).options(selectinload(Project.departments))
    )
    projects = projects_result.scalars().all()
    orphaned_projects = []
    for project in projects:
        project_dept_ids = {d.id for d in project.departments}
        if project_dept_ids == {department_id}:
            orphaned_projects.append(project)

    if orphaned_projects:
        project_list = ", ".join([f"{p.name} (ID: {p.id})" for p in orphaned_projects])
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department: the following projects would be orphaned (have 0 departments): {project_list}. Reassign these projects to another department first."
        )

    # Set department_id to None for all users with this department
    users_result = await db.execute(select(User).where(User.department_id == department_id))
    users = users_result.scalars().all()
    for user in users:
        user.department_id = None

    # Clear role_department associations for this department
    await db.execute(role_department.delete().where(role_department.c.department_id == department_id))

    await db.delete(department)
    await db.commit()