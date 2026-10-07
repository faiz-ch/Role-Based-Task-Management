"""
Zoom meetings router for managing project meetings.
"""
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, can_schedule_meeting, can_view_project
from app.database import get_db
from app.models.user import User
from app.models.project import Project, ProjectStatus, ProjectTeam
from app.models.zoom_meeting import (
    ZoomMeeting,
    ZoomMeetingInvitee,
    ZoomMeetingParticipant,
    ZoomMeetingRecording,
    ZoomMeetingStatus,
)
from app.services.zoom import ZoomClient, ZoomError, get_zoom_client
from app.services.activity_log import log_activity
from app.services import notification_dispatch

router = APIRouter(prefix="/meetings", tags=["meetings"])


# Request/Response schemas
class MeetingCreate(BaseModel):
    title: str
    agenda: str | None = None
    start_time: datetime
    duration_minutes: int
    timezone: str
    recording_enabled: bool = True
    invitee_ids: list[int]


class MeetingOut(BaseModel):
    id: int
    project_id: int
    title: str
    agenda: str | None
    scheduled_start: datetime
    duration_minutes: int
    timezone: str
    status: str
    recording_enabled: bool
    join_url: str | None
    actual_start: datetime | None
    actual_end: datetime | None
    actual_duration_minutes: int | None
    created_at: datetime
    cancelled_at: datetime | None
    invitee_count: int
    attended_count: int


class MeetingDetailOut(BaseModel):
    id: int
    project_id: int
    title: str
    agenda: str | None
    scheduled_start: datetime
    duration_minutes: int
    timezone: str
    status: str
    recording_enabled: bool
    join_url: str | None
    actual_start: datetime | None
    actual_end: datetime | None
    actual_duration_minutes: int | None
    created_at: datetime
    cancelled_at: datetime | None
    invitees: list[dict[str, Any]]
    participants: list[dict[str, Any]]
    recordings: list[dict[str, Any]]


class InviteeAttendanceOut(BaseModel):
    user_id: int
    name: str
    email: str
    attended: bool
    first_joined: datetime | None
    last_left: datetime | None
    total_duration_seconds: int


class ParticipantOut(BaseModel):
    id: int
    user_id: int | None
    name: str | None
    email: str | None
    join_time: datetime | None
    leave_time: datetime | None
    duration_seconds: int | None


class RecordingOut(BaseModel):
    id: int
    zoom_file_id: str
    file_type: str | None
    recording_type: str | None
    file_size_bytes: int | None
    play_url: str | None
    recording_start: datetime | None
    recording_end: datetime | None
    created_at: datetime


@router.post("/projects/{project_id}/meetings", response_model=MeetingOut, status_code=201)
async def create_meeting(
    project_id: int,
    payload: MeetingCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new Zoom meeting for a project."""
    # Load project with team members
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.team_members).selectinload(ProjectTeam.user),
            selectinload(Project.lead),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check permissions
    if not can_schedule_meeting(current_user, project):
        raise HTTPException(status_code=403, detail="You do not have permission to schedule meetings")

    # Validate project status
    if project.status in (ProjectStatus.DONE, ProjectStatus.ARCHIVED):
        raise HTTPException(status_code=400, detail="Cannot schedule meetings for completed or archived projects")

    # Validate input
    if not (1 <= len(payload.title) <= 200):
        raise HTTPException(status_code=400, detail="Title must be between 1 and 200 characters")
    if not (5 <= payload.duration_minutes <= 480):
        raise HTTPException(status_code=400, detail="Duration must be between 5 and 480 minutes")
    if payload.start_time <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Start time must be in the future")
    if not payload.invitee_ids:
        raise HTTPException(status_code=400, detail="At least one invitee is required")

    # Validate invitees are project lead or team members
    valid_user_ids = {tm.user_id for tm in project.team_members}
    if project.lead_id:
        valid_user_ids.add(project.lead_id)

    invalid_ids = set(payload.invitee_ids) - valid_user_ids
    if invalid_ids:
        raise HTTPException(status_code=400, detail="Some invitees are not project team members")

    # Check Zoom is configured
    zoom_client = get_zoom_client()
    host_email = current_user.email

    try:
        # Try to create meeting under scheduler's email
        zoom_data = await zoom_client.create_meeting(
            host_email=host_email,
            title=payload.title,
            start_time=payload.start_time,
            duration_minutes=payload.duration_minutes,
            agenda=payload.agenda,
            recording_enabled=payload.recording_enabled,
        )
    except ZoomError as e:
        if e.code == "1001" and e.status_code == 404:
            # User doesn't exist in Zoom, try fallback
            from app.config import settings
            if not settings.ZOOM_FALLBACK_HOST_EMAIL:
                raise HTTPException(
                    status_code=400,
                    detail="You do not have a Zoom account configured under your PMS email. Please contact your administrator.",
                )
            try:
                zoom_data = await zoom_client.create_meeting(
                    host_email=settings.ZOOM_FALLBACK_HOST_EMAIL,
                    title=payload.title,
                    start_time=payload.start_time,
                    duration_minutes=payload.duration_minutes,
                    agenda=payload.agenda,
                    recording_enabled=payload.recording_enabled,
                    join_before_host=True,
                    waiting_room=False,
                )
                host_email = settings.ZOOM_FALLBACK_HOST_EMAIL
            except ZoomError as e2:
                raise HTTPException(status_code=503, detail=f"Zoom service unavailable: {e2.message}")
        elif e.status_code == 503:
            raise HTTPException(status_code=503, detail="Zoom service not configured")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to create Zoom meeting: {e.message}")

    # Save meeting and invitees
    try:
        meeting = ZoomMeeting(
            project_id=project_id,
            title=payload.title,
            agenda=payload.agenda,
            scheduled_start=payload.start_time,
            duration_minutes=payload.duration_minutes,
            timezone=payload.timezone,
            recording_enabled=payload.recording_enabled,
            zoom_meeting_id=zoom_data["id"],
            zoom_meeting_uuid=zoom_data["uuid"],
            zoom_host_email=host_email,
            join_url=zoom_data["join_url"],
            created_by=current_user.id,
        )
        db.add(meeting)
        await db.flush()

        for invitee_id in payload.invitee_ids:
            invitee = ZoomMeetingInvitee(meeting_id=meeting.id, user_id=invitee_id)
            db.add(invitee)

        # Log activity
        await log_activity(
            db,
            actor_id=current_user.id,
            action="meeting_scheduled",
            entity_type="project",
            entity_id=project_id,
            detail=f"Meeting: {payload.title}",
        )

        await db.commit()
        await db.refresh(meeting)
    except Exception:
        # Try to delete the Zoom meeting if DB save fails
        try:
            await zoom_client.delete_meeting(zoom_data["id"])
        except Exception:
            pass
        raise

    # Email invitees in background
    background_tasks.add_task(notification_dispatch.notify_meeting_scheduled, meeting.id)

    # Return with counts
    invitee_count = len(payload.invitee_ids)
    return MeetingOut(
        id=meeting.id,
        project_id=meeting.project_id,
        title=meeting.title,
        agenda=meeting.agenda,
        scheduled_start=meeting.scheduled_start,
        duration_minutes=meeting.duration_minutes,
        timezone=meeting.timezone,
        status=meeting.status,
        recording_enabled=meeting.recording_enabled,
        join_url=meeting.join_url,
        actual_start=meeting.actual_start,
        actual_end=meeting.actual_end,
        actual_duration_minutes=meeting.actual_duration_minutes,
        created_at=meeting.created_at,
        cancelled_at=meeting.cancelled_at,
        invitee_count=invitee_count,
        attended_count=0,
    )


@router.get("/projects/{project_id}/meetings", response_model=list[MeetingOut])
async def list_meetings(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all meetings for a project with attendance counts."""
    # Load project
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.team_members).selectinload(ProjectTeam.user),
            selectinload(Project.lead),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check view permission
    if not can_view_project(current_user, project):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    # Load meetings with invitees and participants
    result = await db.execute(
        select(ZoomMeeting)
        .options(
            selectinload(ZoomMeeting.invitees),
            selectinload(ZoomMeeting.participants),
        )
        .where(ZoomMeeting.project_id == project_id)
        .order_by(ZoomMeeting.created_at.desc())
    )
    meetings = result.scalars().all()

    output = []
    for meeting in meetings:
        invitee_count = len(meeting.invitees)
        # Compute attended count
        invited_user_ids = {i.user_id for i in meeting.invitees}
        attended_user_ids = {
            p.user_id for p in meeting.participants if p.user_id is not None and p.user_id in invited_user_ids
        }
        attended_count = len(attended_user_ids)

        output.append(
            MeetingOut(
                id=meeting.id,
                project_id=meeting.project_id,
                title=meeting.title,
                agenda=meeting.agenda,
                scheduled_start=meeting.scheduled_start,
                duration_minutes=meeting.duration_minutes,
                timezone=meeting.timezone,
                status=meeting.status,
                recording_enabled=meeting.recording_enabled,
                join_url=meeting.join_url,
                actual_start=meeting.actual_start,
                actual_end=meeting.actual_end,
                actual_duration_minutes=meeting.actual_duration_minutes,
                created_at=meeting.created_at,
                cancelled_at=meeting.cancelled_at,
                invitee_count=invitee_count,
                attended_count=attended_count,
            )
        )

    return output


@router.get("/{meeting_id}", response_model=MeetingDetailOut)
async def get_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed information about a meeting."""
    # Load meeting with all relationships
    result = await db.execute(
        select(ZoomMeeting)
        .options(
            selectinload(ZoomMeeting.project).selectinload(Project.team_members).selectinload(ProjectTeam.user),
            selectinload(ZoomMeeting.project).selectinload(Project.lead),
            selectinload(ZoomMeeting.invitees).selectinload(ZoomMeetingInvitee.user),
            selectinload(ZoomMeeting.participants).selectinload(ZoomMeetingParticipant.user),
            selectinload(ZoomMeeting.recordings),
        )
        .where(ZoomMeeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check view permission
    if not can_view_project(current_user, meeting.project):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    # Compute invitee attendance
    invited_user_ids = {i.user_id for i in meeting.invitees}
    participants_by_user = {}
    for p in meeting.participants:
        if p.user_id:
            if p.user_id not in participants_by_user:
                participants_by_user[p.user_id] = []
            participants_by_user[p.user_id].append(p)

    invitees_out = []
    for invitee in meeting.invitees:
        user_parts = participants_by_user.get(invitee.user_id, [])
        attended = len(user_parts) > 0
        first_joined = min((p.join_time for p in user_parts if p.join_time), default=None)
        last_left = max((p.leave_time for p in user_parts if p.leave_time), default=None)
        total_duration = sum((p.duration_seconds or 0 for p in user_parts))

        invitees_out.append(
            {
                "user_id": invitee.user_id,
                "name": invitee.user.name if invitee.user else "Unknown",
                "email": invitee.user.email if invitee.user else "Unknown",
                "attended": attended,
                "first_joined": first_joined,
                "last_left": last_left,
                "total_duration_seconds": total_duration,
            }
        )

    # Group non-invited participants (guests) by email or name
    guest_participants = [p for p in meeting.participants if p.user_id is None]
    guests_by_key = {}
    for p in guest_participants:
        key = p.email.lower() if p.email else (p.name or "Unknown")
        if key not in guests_by_key:
            guests_by_key[key] = []
        guests_by_key[key].append(p)

    participants_out = []
    for key, parts in guests_by_key.items():
        first_join = min((p.join_time for p in parts if p.join_time), default=None)
        last_leave = max((p.leave_time for p in parts if p.leave_time), default=None)
        total_duration = sum((p.duration_seconds or 0 for p in parts))
        participants_out.append(
            {
                "id": parts[0].id,
                "user_id": None,
                "name": parts[0].name,
                "email": parts[0].email,
                "join_time": first_join,
                "leave_time": last_leave,
                "duration_seconds": total_duration,
            }
        )

    # Recordings (without download_url)
    recordings_out = []
    for rec in meeting.recordings:
        recordings_out.append(
            {
                "id": rec.id,
                "zoom_file_id": rec.zoom_file_id,
                "file_type": rec.file_type,
                "recording_type": rec.recording_type,
                "file_size_bytes": rec.file_size_bytes,
                "play_url": rec.play_url,
                "recording_start": rec.recording_start,
                "recording_end": rec.recording_end,
                "created_at": rec.created_at,
            }
        )

    return MeetingDetailOut(
        id=meeting.id,
        project_id=meeting.project_id,
        title=meeting.title,
        agenda=meeting.agenda,
        scheduled_start=meeting.scheduled_start,
        duration_minutes=meeting.duration_minutes,
        timezone=meeting.timezone,
        status=meeting.status,
        recording_enabled=meeting.recording_enabled,
        join_url=meeting.join_url,
        actual_start=meeting.actual_start,
        actual_end=meeting.actual_end,
        actual_duration_minutes=meeting.actual_duration_minutes,
        created_at=meeting.created_at,
        cancelled_at=meeting.cancelled_at,
        invitees=invitees_out,
        participants=participants_out,
        recordings=recordings_out,
    )


@router.post("/{meeting_id}/sync")
async def sync_meeting(
    meeting_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually refresh attendance data from Zoom."""
    # Load meeting
    result = await db.execute(
        select(ZoomMeeting)
        .options(selectinload(ZoomMeeting.project).selectinload(Project.team_members).selectinload(ProjectTeam.user))
        .options(selectinload(ZoomMeeting.project).selectinload(Project.lead))
        .where(ZoomMeeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check schedule permission
    if not can_schedule_meeting(current_user, meeting.project):
        raise HTTPException(status_code=403, detail="You do not have permission to schedule meetings")

    if not meeting.zoom_meeting_uuid:
        raise HTTPException(status_code=400, detail="Meeting UUID not available")

    # Run sync in background
    background_tasks.add_task(_sync_participants_task, meeting_id)
    return {"message": "Sync started"}


@router.delete("/{meeting_id}")
async def cancel_meeting(
    meeting_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a meeting."""
    # Load meeting
    result = await db.execute(
        select(ZoomMeeting)
        .options(selectinload(ZoomMeeting.project).selectinload(Project.team_members).selectinload(ProjectTeam.user))
        .options(selectinload(ZoomMeeting.project).selectinload(Project.lead))
        .where(ZoomMeeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check schedule permission
    if not can_schedule_meeting(current_user, meeting.project):
        raise HTTPException(status_code=403, detail="You do not have permission to schedule meetings")

    if meeting.status != ZoomMeetingStatus.SCHEDULED.value:
        raise HTTPException(status_code=400, detail="Can only cancel scheduled meetings")

    # Delete on Zoom
    zoom_client = get_zoom_client()
    try:
        await zoom_client.delete_meeting(meeting.zoom_meeting_id)
    except ZoomError as e:
        if e.status_code != 503:
            raise HTTPException(status_code=500, detail=f"Failed to cancel Zoom meeting: {e.message}")

    # Update status
    meeting.status = ZoomMeetingStatus.CANCELLED.value
    meeting.cancelled_at = datetime.now(timezone.utc)

    # Log activity
    await log_activity(
        db,
        actor_id=current_user.id,
        action="meeting_cancelled",
        entity_type="project",
        entity_id=meeting.project_id,
        detail=f"Meeting: {meeting.title}",
    )

    await db.commit()

    # Email invitees in background
    background_tasks.add_task(notification_dispatch.notify_meeting_cancelled, meeting.id)

    return {"message": "Meeting cancelled"}


@router.get("/recordings/{recording_id}/download")
async def download_recording(
    recording_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream a recording download."""
    # Load recording
    result = await db.execute(
        select(ZoomMeetingRecording)
        .options(selectinload(ZoomMeetingRecording.meeting).selectinload(ZoomMeeting.project))
        .where(ZoomMeetingRecording.id == recording_id)
    )
    recording = result.scalar_one_or_none()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Check view permission
    if not can_view_project(current_user, recording.meeting.project):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    if not recording.download_url:
        raise HTTPException(status_code=400, detail="Download URL not available")

    zoom_client = get_zoom_client()
    try:
        stream = await zoom_client.stream_recording(recording.download_url)
        return StreamingResponse(
            stream,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="recording_{recording_id}.{recording.file_type or "mp4"}"',
            },
        )
    except ZoomError as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream recording: {e.message}")


async def _sync_participants_task(meeting_id: int) -> None:
    """Background task to sync participants from Zoom."""
    from app.database import AsyncSessionLocal
    from app.models.user import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ZoomMeeting)
            .options(selectinload(ZoomMeeting.project))
            .where(ZoomMeeting.id == meeting_id)
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            return

        if not meeting.zoom_meeting_uuid:
            return

        zoom_client = get_zoom_client()
        try:
            participants_data = await zoom_client.get_past_participants(meeting.zoom_meeting_uuid)
        except ZoomError as e:
            if e.status_code == 409:
                # Data not ready yet, will retry later via webhook
                return
            return

        # Match users by email
        result = await db.execute(select(User))
        all_users = result.scalars().all()
        email_to_user = {u.email.lower(): u.id for u in all_users if u.email}

        # Delete old participant rows
        await db.execute(delete(ZoomMeetingParticipant).where(ZoomMeetingParticipant.meeting_id == meeting_id))

        # Insert new participant rows
        for p in participants_data:
            user_id = None
            if p.get("user_email"):
                user_id = email_to_user.get(p["user_email"].lower())

            join_time = None
            leave_time = None
            if p.get("join_time"):
                join_time = datetime.fromisoformat(p["join_time"].replace("Z", "+00:00"))
            if p.get("leave_time"):
                leave_time = datetime.fromisoformat(p["leave_time"].replace("Z", "+00:00"))

            participant = ZoomMeetingParticipant(
                meeting_id=meeting_id,
                user_id=user_id,
                name=p.get("name"),
                email=p.get("user_email"),
                join_time=join_time,
                leave_time=leave_time,
                duration_seconds=p.get("duration", 0),
            )
            db.add(participant)

        # Update actual start/end if not set
        if not meeting.actual_start and participants_data:
            first_join = min(
                (datetime.fromisoformat(p["join_time"].replace("Z", "+00:00")) for p in participants_data if p.get("join_time")),
                default=None,
            )
            if first_join:
                meeting.actual_start = first_join

        if not meeting.actual_end and participants_data:
            last_leave = max(
                (datetime.fromisoformat(p["leave_time"].replace("Z", "+00:00")) for p in participants_data if p.get("leave_time")),
                default=None,
            )
            if last_leave:
                meeting.actual_end = last_leave
                if meeting.actual_start:
                    delta = last_leave - meeting.actual_start
                    meeting.actual_duration_minutes = int(delta.total_seconds() / 60)

        meeting.participants_synced_at = datetime.now(timezone.utc)
        await db.commit()
