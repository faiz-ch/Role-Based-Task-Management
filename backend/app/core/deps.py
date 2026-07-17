"""
FastAPI dependencies used to protect routes.

get_current_user: reads the JWT from the Authorization header, figures out
WHO is calling, loads that user from the DB. Any route that needs a logged
in user just adds: current_user: User = Depends(get_current_user)

require_permission: builds on top of get_current_user. Checks if the
current user's role has a specific permission (e.g. "task:assign").
If not, blocks the request with a 403 before the route's own code even runs.
This is what makes RBAC actually enforced, not just decorative.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decode_token
from app.database import get_db
from app.models.user import User
from app.models.role import Role

# tokenUrl is just used by the /docs page to know where to send a login
# request from its "Authorize" button — it doesn't affect real API calls.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise credentials_error

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_error

    # Eager load all relationships needed for permission checks and scoping.
    # Separate selectinload branches from shared parent to avoid chaining issues.
    from app.models.category import Category
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.category).selectinload(Category.permissions),
            selectinload(User.role).selectinload(Role.departments),
            selectinload(User.role).selectinload(Role.assignable_categories).selectinload(Category.permissions),
            selectinload(User.department),
        )
        .where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_error

    return user


def require_permission(permission_name: str):
    """
    Usage in a route:
        @router.post("/tasks")
        async def create_task(..., user: User = Depends(require_permission("task:create"))):
    """

    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role is None or current_user.role.category is None:
            raise HTTPException(status_code=403, detail="User has no role or category assigned")

        user_permissions = {p.name for p in current_user.role.category.permissions}
        if permission_name not in user_permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Missing required permission: {permission_name}",
            )
        return current_user

    return checker


def has_permission(user: User, permission_name: str) -> bool:
    """Check if a user has a specific permission."""
    if user.role is None or user.role.category is None:
        return False
    return any(p.name == permission_name for p in user.role.category.permissions)


def get_scoped_department_ids(user: User) -> set[int] | None:
    """
    Returns None if the role has global (all_departments=True) scope —
    caller should skip department filtering entirely in that case.
    Returns a (possibly empty) set of department ids otherwise.
    """
    if user.role is None:
        return set()
    if user.role.all_departments:
        return None
    return {d.id for d in user.role.departments}