"""
Zoom meeting models for tracking project meetings, invitees, participants, and recordings.
"""
import enum

from sqlalchemy import Column, Integer, String, DateTime, BigInteger, ForeignKey, Boolean, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class ZoomMeetingStatus(str, enum.Enum):
    SCHEDULED = "Scheduled"
    STARTED = "Started"
    ENDED = "Ended"
    CANCELLED = "Cancelled"


class ZoomMeeting(Base):
    __tablename__ = "zoom_meetings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    agenda = Column(String, nullable=True)
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    timezone = Column(String, nullable=False)
    status = Column(String, default=ZoomMeetingStatus.SCHEDULED.value, nullable=False)
    recording_enabled = Column(Boolean, default=True, nullable=False)
    zoom_meeting_id = Column(BigInteger, nullable=True, index=True)
    zoom_meeting_uuid = Column(String, nullable=True)
    zoom_host_email = Column(String, nullable=True)
    join_url = Column(String, nullable=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    actual_duration_minutes = Column(Integer, nullable=True)
    participants_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="zoom_meetings")
    creator = relationship("User", foreign_keys=[created_by])
    invitees = relationship("ZoomMeetingInvitee", back_populates="meeting", cascade="all, delete-orphan")
    participants = relationship("ZoomMeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")
    recordings = relationship("ZoomMeetingRecording", back_populates="meeting", cascade="all, delete-orphan")


class ZoomMeetingInvitee(Base):
    __tablename__ = "zoom_meeting_invitees"

    meeting_id = Column(Integer, ForeignKey("zoom_meetings.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    # Relationships
    meeting = relationship("ZoomMeeting", back_populates="invitees")
    user = relationship("User")


class ZoomMeetingParticipant(Base):
    __tablename__ = "zoom_meeting_participants"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("zoom_meetings.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    join_time = Column(DateTime(timezone=True), nullable=True)
    leave_time = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    # Relationships
    meeting = relationship("ZoomMeeting", back_populates="participants")
    user = relationship("User")


class ZoomMeetingRecording(Base):
    __tablename__ = "zoom_meeting_recordings"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("zoom_meetings.id", ondelete="CASCADE"), nullable=False)
    zoom_file_id = Column(String, nullable=False)
    file_type = Column(String, nullable=True)
    recording_type = Column(String, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    download_url = Column(String, nullable=True)
    play_url = Column(String, nullable=True)
    recording_start = Column(DateTime(timezone=True), nullable=True)
    recording_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    meeting = relationship("ZoomMeeting", back_populates="recordings")

    __table_args__ = (
        UniqueConstraint("meeting_id", "zoom_file_id", name="uq_meeting_zoom_file"),
    )
