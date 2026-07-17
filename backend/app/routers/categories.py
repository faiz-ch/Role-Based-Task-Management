from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.category import Category
from app.models.role import Role
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryOut, PermissionOut

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions)
        )
    )
    return result.scalars().all()


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    existing = await db.execute(select(Category).where(Category.name == payload.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Category name already exists")

    category = Category(name=payload.name)
    db.add(category)
    await db.commit()
    await db.refresh(category)

    # Set permissions
    if payload.permission_ids:
        from app.models.role import Permission
        perms_result = await db.execute(
            select(Permission).where(Permission.id.in_(payload.permission_ids))
        )
        permissions = perms_result.scalars().all()
        category.permissions = permissions

    await db.commit()
    # Re-fetch with all relationships loaded
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions)
        ).where(Category.id == category.id)
    )
    return result.scalar_one()


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions)
        ).where(Category.id == category_id)
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name is not None:
        category.name = payload.name

    if payload.permission_ids is not None:
        from app.models.role import Permission
        perms_result = await db.execute(
            select(Permission).where(Permission.id.in_(payload.permission_ids))
        )
        permissions = perms_result.scalars().all()
        category.permissions = permissions

    await db.commit()
    # Re-fetch to ensure relationships are loaded for response serialization
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions)
        ).where(Category.id == category_id)
    )
    return result.scalar_one()


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    # Set category_id to None for all roles with this category
    roles_result = await db.execute(select(Role).where(Role.category_id == category_id))
    roles = roles_result.scalars().all()
    for role in roles:
        role.category_id = None

    # Clear any role_assignable_category rows referencing this category
    # (a role can list this category in its "can assign" list even if this
    # isn't the role's own category) — otherwise the delete below violates
    # the foreign key on role_assignable_category.category_id.
    from app.models.role import role_assignable_category
    await db.execute(
        role_assignable_category.delete().where(
            role_assignable_category.c.category_id == category_id
        )
    )

    await db.delete(category)
    await db.commit()