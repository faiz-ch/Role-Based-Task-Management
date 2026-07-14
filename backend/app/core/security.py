"""
Security core: password hashing + JWT tokens.

WHY TWO TOKENS (access + refresh)?
- Access token: short-lived (15 min here). Sent with every API request
  to prove who you are. If someone steals it, the damage window is small
  because it expires fast.
- Refresh token: long-lived (7 days here). Its ONLY job is to get you a
  new access token without logging in again. It's stored more carefully
  (e.g. httpOnly cookie in a real production app) and rarely sent around.

Flow:
1. Login -> server gives you both an access token and a refresh token.
2. You call APIs using the access token in the Authorization header.
3. After 15 min, access token expires. Instead of asking the user to log
   in again, the frontend calls /auth/refresh with the refresh token to
   get a fresh access token.
4. After 7 days, the refresh token itself expires -> user must log in again.
"""
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _create_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": token_type})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _create_token(
        {"sub": str(user_id)},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        token_type="access",
    )


def create_refresh_token(user_id: int) -> str:
    return _create_token(
        {"sub": str(user_id)},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        token_type="refresh",
    )


def decode_token(token: str) -> dict | None:
    """Returns the payload dict if valid, or None if expired/tampered/invalid."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
