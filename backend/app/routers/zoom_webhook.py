"""
Zoom webhook router for handling meeting events.
"""
import asyncio
import hashlib
import hmac
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.zoom_meeting import ZoomMeeting, ZoomMeetingRecording, ZoomMeetingStatus
from app.services.zoom import verify_webhook_signature

router = APIRouter(prefix="/zoom", tags=["zoom"])


@router.post("/webhook")
async def zoom_webhook(request: Request, background_tasks: BackgroundTasks):
    """Handle Zoom webhook events."""
    raw_body = await request.body()
    timestamp = request.headers.get("x-zm-request-timestamp", "")
    signature = request.headers.get("x-zm-signature", "")

    # Check if webhook is configured
    if not settings.ZOOM_WEBHOOK_SECRET_TOKEN:
        raise HTTPException(status_code=503, detail="Zoom webhook not configured")

    # Parse JSON
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("event", "")
    event_ts = payload.get("event_ts")

    # URL validation challenge
    if event_type == "endpoint.url_validation":
        plain_token = payload.get("plainToken", "")
        if not plain_token:
            raise HTTPException(status_code=400, detail="Missing plainToken")

        encrypted_token = hmac.new(
            settings.ZOOM_WEBHOOK_SECRET_TOKEN.encode(),
            plain_token.encode(),
            hashlib.sha256,
        ).hexdigest()

        return {"plainToken": plain_token, "encryptedToken": encrypted_token}

    # Verify signature for other events
    if not verify_webhook_signature(raw_body, timestamp, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Reject old timestamps (5 minutes)
    try:
        event_time = datetime.fromtimestamp(int(event_ts), tz=timezone.utc)
        if datetime.now(timezone.utc) - event_time > timedelta(minutes=5):
            raise HTTPException(status_code=403, detail="Timestamp too old")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid timestamp")

    # Handle events
    if event_type == "meeting.started":
        background_tasks.add_task(_handle_meeting_started, payload)
    elif event_type == "meeting.ended":
        background_tasks.add_task(_handle_meeting_ended, payload)
    elif event_type == "recording.completed":
        background_tasks.add_task(_handle_recording_completed, payload)

    return {"status": "ok"}


async def _handle_meeting_started(payload: dict) -> None:
    """Handle meeting.started event."""
    async with AsyncSessionLocal() as db:
        zoom_meeting_id = payload.get("object", {}).get("id")
        if not zoom_meeting_id:
            return

        result = await db.execute(
            select(ZoomMeeting).where(ZoomMeeting.zoom_meeting_id == zoom_meeting_id)
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            return

        meeting.status = ZoomMeetingStatus.STARTED.value
        meeting.actual_start = datetime.now(timezone.utc)
        await db.commit()


async def _handle_meeting_ended(payload: dict) -> None:
    """Handle meeting.ended event."""
    async with AsyncSessionLocal() as db:
        zoom_meeting_id = payload.get("object", {}).get("id")
        meeting_uuid = payload.get("object", {}).get("uuid")
        if not zoom_meeting_id or not meeting_uuid:
            return

        result = await db.execute(
            select(ZoomMeeting).where(ZoomMeeting.zoom_meeting_id == zoom_meeting_id)
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            return

        meeting.status = ZoomMeetingStatus.ENDED.value
        meeting.actual_end = datetime.now(timezone.utc)
        meeting.zoom_meeting_uuid = meeting_uuid

        if meeting.actual_start:
            delta = meeting.actual_end - meeting.actual_start
            meeting.actual_duration_minutes = int(delta.total_seconds() / 60)

        await db.commit()

        # Schedule participant sync with retries
        await _schedule_sync_with_retries(meeting.id)


async def _schedule_sync_with_retries(meeting_id: int) -> None:
    """Schedule participant sync with retries (Zoom data can lag)."""
    delays = [0, 120, 300]  # Immediate, 2 min, 5 min

    for delay in delays:
        if delay > 0:
            await asyncio.sleep(delay)

        from app.routers.zoom_meetings import _sync_participants_task
        await _sync_participants_task(meeting_id)


async def _handle_recording_completed(payload: dict) -> None:
    """Handle recording.completed event."""
    async with AsyncSessionLocal() as db:
        zoom_meeting_id = payload.get("object", {}).get("id")
        if not zoom_meeting_id:
            return

        result = await db.execute(
            select(ZoomMeeting)
            .options(selectinload(ZoomMeeting.recordings))
            .where(ZoomMeeting.zoom_meeting_id == zoom_meeting_id)
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            return

        # Get existing file IDs
        existing_file_ids = {r.zoom_file_id for r in meeting.recordings}

        # Process recording files
        recording_files = payload.get("object", {}).get("recording_files", [])
        for file_data in recording_files:
            zoom_file_id = file_data.get("file_id")
            if not zoom_file_id:
                continue

            # Skip if already stored
            if zoom_file_id in existing_file_ids:
                continue

            recording_start = None
            recording_end = None
            if file_data.get("recording_start"):
                recording_start = datetime.fromisoformat(file_data["recording_start"].replace("Z", "+00:00"))
            if file_data.get("recording_end"):
                recording_end = datetime.fromisoformat(file_data["recording_end"].replace("Z", "+00:00"))

            recording = ZoomMeetingRecording(
                meeting_id=meeting.id,
                zoom_file_id=zoom_file_id,
                file_type=file_data.get("file_type"),
                recording_type=file_data.get("recording_type"),
                file_size_bytes=file_data.get("file_size"),
                download_url=file_data.get("download_url"),
                play_url=file_data.get("play_url"),
                recording_start=recording_start,
                recording_end=recording_end,
            )
            db.add(recording)

        await db.commit()
