"""
"Forgot password" codes.

A 6-digit code is emailed to the person. Only an HMAC fingerprint of it is stored
(never the code), with an expiry, a count of wrong tries, and when it was used.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func

from app.database import Base


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_hash = Column(String(64), nullable=False)       # HMAC-SHA256 of "user_id:code"
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)   # set when used OR cancelled
    requested_ip = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
