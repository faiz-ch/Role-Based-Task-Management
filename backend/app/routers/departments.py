from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.department import Department
from app.models.user import User
from app.models.task import Task
from app.schemas.department import DepartmentCreate, DepartmentOut

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all departments. Requires user:manage permission."""
    result = await db.execute(select(Department))
    return result.scalars().all()


@router.post("", response_model=DepartmentOut, status_code=201)
async def create_department(
    payload: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("department:manage")),
):
    """Create a new department. Requires user:manage permission."""
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
    Delete a department. Requires user:manage permission.
    Before deleting, sets department_id to None on any users and tasks
    currently pointing to it (same pattern as delete_role).
    """
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")

    # Set department_id to None for all users with this department
    users_result = await db.execute(select(User).where(User.department_id == department_id))
    users = users_result.scalars().all()
    for user in users:
        user.department_id = None

    # Set department_id to None for all tasks with this department
    tasks_result = await db.execute(select(Task).where(Task.department_id == department_id))
    tasks = tasks_result.scalars().all()
    for task in tasks:
        task.department_id = None

    await db.delete(department)
    await db.commit()
