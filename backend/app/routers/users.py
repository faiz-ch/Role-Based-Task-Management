from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user
from app.core.security import hash_password
from app.database import get_db
from app.models.user import User
from app.models.role import Role
from app.models.department import Department
from app.models.task import Task
from app.schemas.user import UserOut, UserUpdate, AssignRoleRequest, AssignDepartmentRequest, UserCreate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Any logged-in user can view the user list (for assignee selection, etc.)."""
    result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.department))
    )
    return result.scalars().all()


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("user:manage")),
):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    if payload.role_id is not None:
        role_result = await db.execute(select(Role).where(Role.id == payload.role_id))
        if role_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Role not found")

    if payload.department_id is not None:
        dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
        if dept_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Department not found")

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        department_id=payload.department_id,
    )
    db.add(user)
    await db.commit()
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
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
    _: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

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
        # Validate department exists if not null
        if payload.department_id != 0:  # 0 or null means unassigned
            dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
            if dept_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Department not found")
        user.department_id = payload.department_id if payload.department_id != 0 else None

    await db.commit()
    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()


@router.patch("/{user_id}/role", response_model=UserOut)
async def assign_role(
    user_id: int,
    payload: AssignRoleRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("user:manage")),
):
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role_id is None:
        user.role_id = None
    else:
        role_result = await db.execute(select(Role).where(Role.id == payload.role_id))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")
        user.role_id = role.id

    await db.commit()
    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    # Check if user created any tasks
    tasks_created_result = await db.execute(
        select(Task).where(Task.created_by == user_id)
    )
    if tasks_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created tasks that still exist. Reassign or delete those tasks before deleting the user."
        )

    # Unassign tasks where this user is the assignee
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
    _: User = Depends(require_permission("user:manage")),
):
    """
    Assign a user to a department. Mirrors the assign_role endpoint pattern.
    Validates the department exists if not null, sets user.department_id,
    and returns the user with both role and department eager-loaded.
    """
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.department_id is None:
        user.department_id = None
    else:
        dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
        department = dept_result.scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=404, detail="Department not found")
        user.department_id = department.id

    await db.commit()
    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user.id)
    )
    return result.scalar_one()
