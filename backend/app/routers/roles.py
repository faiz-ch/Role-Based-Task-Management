from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.role import Role, Permission, role_permission, role_assignable_role, role_department
from app.models.category import Category
from app.models.user import User
from app.models.activity_log import ActivityLog
from app.schemas.activity_log import ActivityLogOut
from app.schemas.role import (
    RoleCreate,
    RoleOut,
    RoleUpdate,
    PermissionOut,
)
from app.services.activity_log import log_activity

router = APIRouter(prefix="/roles", tags=["roles"])


async def _role_to_out(db: AsyncSession, role: Role) -> RoleOut:
    """Convert Role model to RoleOut schema with counts and loaded relationships."""
    await db.refresh(role, ["permissions", "departments", "assignable_roles", "creator"])
    user_count_result = await db.execute(select(User).where(User.role_id == role.id))
    user_count = len(user_count_result.scalars().all())
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        color=role.color,
        is_active=role.is_active,
        is_system=role.is_system,
        created_by=role.created_by,
        creator={"id": role.creator.id, "name": role.creator.name} if role.creator else None,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permissions=list(role.permissions),
        all_departments=role.all_departments,
        departments=list(role.departments),
        all_roles=role.all_roles,
        assignable_roles=list(role.assignable_roles),
        user_count=user_count,
    )


@router.get("", response_model=list[RoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all roles. Requires authentication."""
    result = await db.execute(
        select(Role).options(
            selectinload(Role.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_roles),
            selectinload(Role.creator),
        )
    )
    roles = result.scalars().all()
    out_list = []
    for role in roles:
        out_list.append(await _role_to_out(db, role))
    return out_list


@router.get("/{role_id}", response_model=RoleOut)
async def get_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    """Get a single role by ID. Requires role:manage permission."""
    result = await db.execute(
        select(Role).options(
            selectinload(Role.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_roles),
            selectinload(Role.creator),
        ).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    return await _role_to_out(db, role)


@router.get("/{role_id}/activity", response_model=list[ActivityLogOut])
async def get_role_activity(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("role:manage")),
):
    """Get activity log for a role. Requires role:manage."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    logs_result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.entity_type == "role", ActivityLog.entity_id == role_id)
        .order_by(ActivityLog.created_at.desc())
    )
    return logs_result.scalars().all()


@router.post("", response_model=RoleOut, status_code=201)
async def create_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("role:manage")),
):
    """Create a new role. Requires role:manage permission."""
    existing = await db.execute(select(Role).where(Role.name == payload.name))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = Role(
        name=payload.name,
        description=payload.description,
        color=payload.color,
        is_active=payload.is_active,
        is_system=payload.is_system,
        category_id=payload.category_id,
        all_departments=payload.all_departments,
        all_roles=payload.all_roles,
        created_by=current_user.id,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)

    # Resolve permissions: use explicit permission_ids if provided, otherwise copy from category
    resolved_permission_ids = payload.permission_ids
    if not resolved_permission_ids and payload.category_id is not None:
        category_result = await db.execute(
            select(Category).options(selectinload(Category.permissions)).where(Category.id == payload.category_id)
        )
        category = category_result.scalar_one_or_none()
        if category is not None:
            resolved_permission_ids = [p.id for p in category.permissions]

    # Insert permission associations
    if resolved_permission_ids:
        for perm_id in resolved_permission_ids:
            await db.execute(role_permission.insert().values(role_id=role.id, permission_id=perm_id))

    # Insert department associations (skip if all_departments is true)
    if not role.all_departments and payload.department_ids:
        for dept_id in payload.department_ids:
            await db.execute(role_department.insert().values(role_id=role.id, department_id=dept_id))

    # Insert assignable role associations (skip if all_roles is true)
    if not role.all_roles and payload.assignable_role_ids:
        for assignable_role_id in payload.assignable_role_ids:
            await db.execute(role_assignable_role.insert().values(role_id=role.id, assignable_role_id=assignable_role_id))

    await log_activity(
        db,
        current_user.id,
        "role_created",
        "role",
        role.id,
        detail=f"Created role '{role.name}'",
    )

    await db.commit()
    return await _role_to_out(db, role)


@router.patch("/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("role:manage")),
):
    """Update a role. Requires role:manage permission."""
    result = await db.execute(
        select(Role).options(
            selectinload(Role.permissions),
            selectinload(Role.departments),
            selectinload(Role.assignable_roles),
            selectinload(Role.creator),
        ).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    # Track changed fields for activity log
    changed_fields = []

    # Apply only fields that are present (partial update)
    if payload.name is not None:
        role.name = payload.name
        changed_fields.append("name")
    if payload.description is not None:
        role.description = payload.description
        changed_fields.append("description")
    if payload.color is not None:
        role.color = payload.color
        changed_fields.append("color")
    if payload.is_active is not None:
        role.is_active = payload.is_active
        changed_fields.append("is_active")
    if payload.is_system is not None:
        role.is_system = payload.is_system
        changed_fields.append("is_system")

    # Handle permissions update
    if payload.permission_ids is not None:
        # Clear existing permission associations
        await db.execute(role_permission.delete().where(role_permission.c.role_id == role_id))
        # Add new permission associations
        for perm_id in payload.permission_ids:
            await db.execute(role_permission.insert().values(role_id=role_id, permission_id=perm_id))
        changed_fields.append("permissions")

    # Handle departments/all_departments update
    if payload.department_ids is not None or payload.all_departments is not None:
        if payload.all_departments is not None:
            role.all_departments = payload.all_departments
            changed_fields.append("all_departments")

        # Clear existing department associations
        await db.execute(role_department.delete().where(role_department.c.role_id == role_id))

        # Add new department associations if not all_departments
        if not role.all_departments and payload.department_ids:
            for dept_id in payload.department_ids:
                await db.execute(role_department.insert().values(role_id=role_id, department_id=dept_id))
        elif payload.department_ids is not None:
            changed_fields.append("departments")

    # Handle assignable roles/all_roles update
    if payload.assignable_role_ids is not None or payload.all_roles is not None:
        if payload.all_roles is not None:
            role.all_roles = payload.all_roles
            changed_fields.append("all_roles")

        # Clear existing assignable role associations
        await db.execute(role_assignable_role.delete().where(role_assignable_role.c.role_id == role_id))

        # Add new assignable role associations if not all_roles
        if not role.all_roles and payload.assignable_role_ids:
            for assignable_role_id in payload.assignable_role_ids:
                await db.execute(role_assignable_role.insert().values(role_id=role_id, assignable_role_id=assignable_role_id))
        elif payload.assignable_role_ids is not None:
            changed_fields.append("assignable_roles")

    if not changed_fields:
        # No fields to update
        return await _role_to_out(db, role)

    await db.commit()
    await db.refresh(role)

    # Log activity with detail summarizing changes
    changes_str = ", ".join(changed_fields)
    await log_activity(
        db,
        current_user.id,
        "role_updated",
        "role",
        role.id,
        detail=f"Updated role '{role.name}': {changes_str}",
    )

    await db.commit()
    return await _role_to_out(db, role)


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("role:manage")),
):
    """Delete a role. Requires role:manage permission."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    # Capture affected user count before unassigning
    users_result = await db.execute(select(User).where(User.role_id == role_id))
    users = users_result.scalars().all()
    user_count = len(users)

    # Set role_id to None for all users with this role
    for user in users:
        user.role_id = None

    await db.commit()

    await log_activity(
        db,
        current_user.id,
        "role_deleted",
        "role",
        role.id,
        detail=f"Deleted role '{role.name}', unassigned from {user_count} users",
    )

    # Clear role_permission rows for this role
    await db.execute(role_permission.delete().where(role_permission.c.role_id == role_id))

    # Clear role_department rows for this role
    await db.execute(role_department.delete().where(role_department.c.role_id == role_id))

    # Clear role_assignable_role rows in BOTH directions — this role as the
    # assigner, and this role as the assignable target of some other role
    await db.execute(
        role_assignable_role.delete().where(
            (role_assignable_role.c.role_id == role_id) |
            (role_assignable_role.c.assignable_role_id == role_id)
        )
    )

    await db.delete(role)
    await db.commit()


@router.get("/permissions/all", response_model=list[PermissionOut])
async def list_all_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns the fixed system permission list — used to build the checkbox UI."""
    result = await db.execute(select(Permission))
    return result.scalars().all()
