from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.role import Role, Permission
from app.models.category import Category
from app.models.user import User
from app.schemas.role import RoleCreate, RoleOut, SetRoleCategoryRequest, PermissionOut

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category)
            .selectinload(Category.permissions)
            .selectinload(Category.departments)
        )
    )
    return result.scalars().all()


@router.post("", response_model=RoleOut, status_code=201)
async def create_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    existing = await db.execute(select(Role).where(Role.name == payload.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = Role(name=payload.name, category_id=payload.category_id)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    # Re-fetch with category loaded
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category)
            .selectinload(Category.permissions)
            .selectinload(Category.departments)
        ).where(Role.id == role.id)
    )
    return result.scalar_one()


@router.patch("/{role_id}/category", response_model=RoleOut)
async def set_role_category(
    role_id: int,
    payload: SetRoleCategoryRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category)
            .selectinload(Category.permissions)
            .selectinload(Category.departments)
        ).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    if payload.category_id is not None:
        category_result = await db.execute(select(Category).where(Category.id == payload.category_id))
        category = category_result.scalar_one_or_none()
        if category is None:
            raise HTTPException(status_code=404, detail="Category not found")
    
    role.category_id = payload.category_id

    await db.commit()
    # Re-fetch to ensure category is loaded for response serialization
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category)
            .selectinload(Category.permissions)
            .selectinload(Category.departments)
        ).where(Role.id == role_id)
    )
    return result.scalar_one()


@router.get("/permissions/all", response_model=list[PermissionOut])
async def list_all_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns the fixed system permission list — used to build the checkbox UI."""
    result = await db.execute(select(Permission))
    return result.scalars().all()


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    # Set role_id to None for all users with this role
    users_result = await db.execute(select(User).where(User.role_id == role_id))
    users = users_result.scalars().all()
    for user in users:
        user.role_id = None

    await db.delete(role)
    await db.commit()
