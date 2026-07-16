from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.category import Category
from app.models.role import Role
from app.models.department import Department
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryOut, PermissionOut, DepartmentOut

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions),
            selectinload(Category.departments),
            selectinload(Category.assignable_categories)
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

    # Set departments
    if payload.department_ids:
        depts_result = await db.execute(
            select(Department).where(Department.id.in_(payload.department_ids))
        )
        departments = depts_result.scalars().all()
        category.departments = departments

    # Set assignable categories
    if payload.assignable_category_ids:
        cats_result = await db.execute(
            select(Category).where(Category.id.in_(payload.assignable_category_ids))
        )
        assignable_categories = cats_result.scalars().all()
        category.assignable_categories = assignable_categories

    await db.commit()
    # Re-fetch with all relationships loaded
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions),
            selectinload(Category.departments),
            selectinload(Category.assignable_categories)
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
            selectinload(Category.permissions),
            selectinload(Category.departments),
            selectinload(Category.assignable_categories)
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

    if payload.department_ids is not None:
        depts_result = await db.execute(
            select(Department).where(Department.id.in_(payload.department_ids))
        )
        departments = depts_result.scalars().all()
        category.departments = departments

    if payload.assignable_category_ids is not None:
        cats_result = await db.execute(
            select(Category).where(Category.id.in_(payload.assignable_category_ids))
        )
        assignable_categories = cats_result.scalars().all()
        category.assignable_categories = assignable_categories

    await db.commit()
    # Re-fetch to ensure relationships are loaded for response serialization
    result = await db.execute(
        select(Category).options(
            selectinload(Category.permissions),
            selectinload(Category.departments),
            selectinload(Category.assignable_categories)
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

    await db.delete(category)
    await db.commit()
