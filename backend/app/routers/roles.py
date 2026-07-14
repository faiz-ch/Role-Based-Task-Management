from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission
from app.database import get_db
from app.models.role import Role, Permission
from app.models.user import User
from app.schemas.role import RoleCreate, RoleOut, SetRolePermissionsRequest, PermissionOut

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(select(Role).options(selectinload(Role.permissions)))
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

    role = Role(name=payload.name)
    db.add(role)
    await db.commit()
    return RoleOut(id=role.id, name=role.name, permissions=[])


@router.patch("/{role_id}/permissions", response_model=RoleOut)
async def set_role_permissions(
    role_id: int,
    payload: SetRolePermissionsRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    perms_result = await db.execute(
        select(Permission).where(Permission.id.in_(payload.permission_ids))
    )
    permissions = perms_result.scalars().all()

    # This REPLACES the whole permission set for the role (not additive) —
    # simplest mental model for an admin UI with checkboxes: "here's the
    # full list of what should be checked now."
    role.permissions = permissions

    await db.commit()
    # Re-fetch to ensure permissions are loaded for response serialization
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role.id)
    )
    return result.scalar_one()


@router.get("/permissions/all", response_model=list[PermissionOut])
async def list_all_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
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
