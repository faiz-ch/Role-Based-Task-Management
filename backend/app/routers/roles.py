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
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
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

    role = Role(
        name=payload.name, 
        category_id=payload.category_id,
        all_departments=payload.all_departments,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    
    # Handle departments if provided
    if payload.department_ids:
        from app.models.role import role_department
        for dept_id in payload.department_ids:
            await db.execute(role_department.insert().values(role_id=role.id, department_id=dept_id))
    
    # Handle assignable categories if provided
    if payload.assignable_category_ids:
        from app.models.role import role_assignable_category
        for cat_id in payload.assignable_category_ids:
            await db.execute(role_assignable_category.insert().values(role_id=role.id, category_id=cat_id))
    
    await db.commit()
    # Re-fetch with category loaded
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
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
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
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
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
        ).where(Role.id == role_id)
    )
    return result.scalar_one()


@router.patch("/{role_id}/departments", response_model=RoleOut)
async def set_role_departments(
    role_id: int,
    payload: dict,  # {"department_ids": list[int], "all_departments": bool}
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
        ).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    from app.models.role import role_department
    
    # Update all_departments flag
    role.all_departments = payload.get("all_departments", False)
    
    # Clear existing department associations
    await db.execute(role_department.delete().where(role_department.c.role_id == role_id))
    
    # Add new department associations if not all_departments
    if not role.all_departments and payload.get("department_ids"):
        for dept_id in payload["department_ids"]:
            await db.execute(role_department.insert().values(role_id=role_id, department_id=dept_id))

    await db.commit()
    # Re-fetch to ensure relationships are loaded
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
        ).where(Role.id == role_id)
    )
    return result.scalar_one()


@router.patch("/{role_id}/assignable-categories", response_model=RoleOut)
async def set_role_assignable_categories(
    role_id: int,
    payload: dict,  # {"assignable_category_ids": list[int]}
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
        ).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    from app.models.role import role_assignable_category
    
    # Clear existing assignable category associations
    await db.execute(role_assignable_category.delete().where(role_assignable_category.c.role_id == role_id))
    
    # Add new assignable category associations
    if payload.get("assignable_category_ids"):
        for cat_id in payload["assignable_category_ids"]:
            await db.execute(role_assignable_category.insert().values(role_id=role_id, category_id=cat_id))

    await db.commit()
    # Re-fetch to ensure relationships are loaded
    result = await db.execute(
        select(Role).options(
            selectinload(Role.category).selectinload(Category.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_categories).selectinload(Category.permissions)
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