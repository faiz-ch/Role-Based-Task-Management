"""
Sends emails using aiosmtplib, connecting to whichever SMTP server is
configured in .env (Gmail, Hostinger, etc.). This is the ONE place in the
whole app that actually knows how to send an email — everything else
(task-assigned, task-submitted-for-review, etc.) calls this function
instead of dealing with SMTP directly. If you ever switch providers later
(e.g. to Resend's SMTP relay), only this file needs to change.
"""
import logging

import aiosmtplib
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html_body: str) -> None:
    """
    Sends one email. Never raises — if EMAIL_ADDRESS/EMAIL_PASSWORD aren't
    configured yet, or sending fails for any reason, this logs the problem
    and returns quietly instead of crashing whatever task-status-change
    request triggered it.
    """
    if not settings.EMAIL_ADDRESS or not settings.EMAIL_PASSWORD:
        logger.warning("Email not configured (EMAIL_ADDRESS/EMAIL_PASSWORD empty) — skipping send to %s", to)
        return

    message = EmailMessage()
    message["From"] = settings.EMAIL_ADDRESS
    message["To"] = to
    message["Subject"] = subject
    message.set_content("Please view this email in an HTML-capable client.")
    message.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=587,
            username=settings.EMAIL_ADDRESS,
            password=settings.EMAIL_PASSWORD,
            start_tls=True,
        )
    except Exception:
        logger.exception("Failed to send email to %s", to)