from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, RefreshRequest, TokenResponse
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Note: no role_id set here -> new users start with NO role.
    # An admin must assign one via PATCH /users/{id}/role before this
    # user can do anything beyond logging in. This is intentional —
    # you don't want new signups to have any access by default.
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User).options(selectinload(User.role)).where(User.id == user.id)
    )
    return result.scalar_one()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Deliberately the SAME error for "no such user" and "wrong password" —
    # telling an attacker WHICH one was wrong makes it easier for them to
    # find valid emails in your system.
    invalid_creds = HTTPException(status_code=401, detail="Incorrect email or password")

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise invalid_creds
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_data = decode_token(payload.refresh_token)

    if token_data is None or token_data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user_id = int(token_data["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User no longer valid")

    # Issue a BOTH new access and refresh token (this is called "rotation" —
    # it limits how long a leaked refresh token stays useful).
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )
