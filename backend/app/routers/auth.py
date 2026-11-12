import hashlib
import hmac
import logging
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Request
from sqlalchemy import func, select, update
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
from app.core.deps import user_load_options, get_current_user
from app.models.user import User
from app.models.role import Role
from app.config import settings
from app.models.password_reset import PasswordResetCode
from app.schemas.auth import (
    RegisterRequest, LoginRequest, RefreshRequest, TokenResponse, ForgotPasswordRequest, ResetPasswordRequest,
)
from app.services import email_templates
from app.services.email import send_email
from app.schemas.user import UserOut, ChangePasswordRequest
from app.services.activity_log import log_activity

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Self-registration is switched off: accounts are created by an administrator
    # (Users page) or, for the very first Admin, by app/bootstrap_admin.py.
    raise HTTPException(status_code=403, detail="Self-registration is disabled. Ask an administrator for an account.")
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
        select(User).options(*user_load_options()).where(User.id == user.id)
    )
    return result.scalar_one()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
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

    client_ip = request.client.host if request.client else "unknown"
    await log_activity(db, user.id, "user_logged_in", "user", user.id, detail=f"Login from {client_ip}")
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version or 0),
        refresh_token=create_refresh_token(user.id, user.token_version or 0),
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
    if int(token_data.get("ver", 0)) != (user.token_version or 0):
        # signed out by a password reset / admin password change
        raise HTTPException(status_code=401, detail="Session ended. Please sign in again.")

    # Issue a BOTH new access and refresh token (this is called "rotation" —
    # it limits how long a leaked refresh token stays useful).
    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version or 0),
        refresh_token=create_refresh_token(user.id, user.token_version or 0),
    )


@router.post("/change-password", status_code=204)
async def change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any signed-in user can change their OWN password (My Profile). They stay signed in."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="The new password must be different from the current one")
    current_user.hashed_password = hash_password(payload.new_password)
    await log_activity(db, current_user.id, "password_changed", "user", current_user.id, detail="Changed own password")
    await db.commit()


# =============================================================================
# Forgot password: a 6-digit code by email (one screen: code + new password)
#
#   POST /auth/forgot-password  {email}                     -> always the same reply
#   POST /auth/reset-password   {email, code, new_password} -> password changed
#
# - The code comes from the OS secure random generator; only an HMAC fingerprint
#   (keyed with SECRET_KEY, mixed with the user id) is stored.
# - 10 minutes, works once, 5 wrong tries cancel it, a new code cancels the old one.
# - At most 3 codes per person per hour; each network address is also limited.
# - The reply never says whether an email is registered.
# - A reset signs the person out everywhere (token_version + 1) and sends a
#   "password changed" email.
# =============================================================================
logger = logging.getLogger(__name__)
CODE_MINUTES = 10
MAX_TRIES = 5
CODES_PER_HOUR = 3
GENERIC_REPLY = {"message": "If that email is registered, a 6-digit code has been sent to it."}
_ip_hits: dict[str, deque] = defaultdict(deque)   # address -> request times (this server process)


def _limit_ip(request: Request, window: int = 900) -> None:
    """At most RESET_REQUESTS_PER_IP reset requests per network address per 15 minutes."""
    max_hits = settings.RESET_REQUESTS_PER_IP
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    hits = _ip_hits[ip]
    while hits and now - hits[0] > window:
        hits.popleft()
    if len(hits) >= max_hits:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait 15 minutes and try again.")
    hits.append(now)


def _fingerprint(user_id: int, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


async def _active_user_by_email(db: AsyncSession, email: str) -> User | None:
    rows = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    user = rows.scalars().first()
    return user if user is not None and user.is_active else None


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request, background_tasks: BackgroundTasks,
                          db: AsyncSession = Depends(get_db)):
    _limit_ip(request)
    user = await _active_user_by_email(db, payload.email)
    if user is None:
        return GENERIC_REPLY
    now = datetime.now(timezone.utc)
    recent = (await db.execute(
        select(func.count()).select_from(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.created_at > now - timedelta(hours=1))
    )).scalar() or 0
    if recent >= CODES_PER_HOUR:
        logger.info("Password reset: hourly limit reached for user %s", user.id)
        return GENERIC_REPLY   # same reply: don't reveal anything
    # only the newest code works
    await db.execute(update(PasswordResetCode)
                     .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None))
                     .values(used_at=now))
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(PasswordResetCode(user_id=user.id, code_hash=_fingerprint(user.id, code),
                             expires_at=now + timedelta(minutes=CODE_MINUTES),
                             requested_ip=request.client.host if request.client else None))
    await log_activity(db, user.id, "password_reset_requested", "user", user.id, detail="Reset code emailed")
    await db.commit()
    subject, body = email_templates.password_reset_code_email(user.name, code, CODE_MINUTES)
    background_tasks.add_task(send_email, user.email, subject, body)
    return GENERIC_REPLY


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request, background_tasks: BackgroundTasks,
                         db: AsyncSession = Depends(get_db)):
    _limit_ip(request)
    invalid = HTTPException(status_code=400, detail="The code is wrong or has expired. Check it, or ask for a new code.")
    user = await _active_user_by_email(db, payload.email)
    if user is None:
        raise invalid
    now = datetime.now(timezone.utc)
    rec = (await db.execute(
        select(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None),
               PasswordResetCode.expires_at > now)
        .order_by(PasswordResetCode.id.desc()).limit(1).with_for_update()
    )).scalar_one_or_none()
    if rec is None:
        raise invalid
    if not hmac.compare_digest(rec.code_hash, _fingerprint(user.id, payload.code)):
        rec.attempts += 1
        if rec.attempts >= MAX_TRIES:
            rec.used_at = now   # too many wrong tries: cancel this code
        await db.commit()
        if rec.used_at is not None:
            raise HTTPException(status_code=400, detail="Too many wrong tries. Please ask for a new code.")
        raise invalid
    # correct: use the code up, change the password, sign out everywhere
    rec.used_at = now
    user.hashed_password = hash_password(payload.new_password)
    user.token_version = (user.token_version or 0) + 1
    await log_activity(db, user.id, "password_reset", "user", user.id, detail="Password reset with an emailed code")
    await db.commit()
    subject, body = email_templates.password_changed_email(user.name, "with a reset code")
    background_tasks.add_task(send_email, user.email, subject, body)
    return {"message": "Your password has been changed. Please sign in with the new password."}
