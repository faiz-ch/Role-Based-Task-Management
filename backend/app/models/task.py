"""
Task model. status uses a Python Enum so the database and our code both
agree on the only valid values — you can't accidentally save status="Donee".
"""
import enum

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, func
from sqlalchemy.orm import relationship

from app.database import Base


class TaskStatus(str, enum.Enum):
    TODO = "To Do"
    REVIEW = "Review"
    DONE = "Done"
    RESCHEDULE = "Reschedule"


class TaskPriority(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class TaskTeam(Base):
    """
    Association table for task team members with metadata.
    Tracks who added each team member and when.
    """
    __tablename__ = "task_team"

    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    task = relationship("Task", back_populates="team_members")
    user = relationship("User", foreign_keys=[user_id])
    adder = relationship("User", foreign_keys=[added_by])


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.TODO, nullable=False)
    priority = Column(Enum(TaskPriority), default=TaskPriority.MEDIUM, nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    lead_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_approved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships - must specify foreign_keys= since multiple FKs point to User
    creator = relationship("User", foreign_keys=[created_by], back_populates="tasks_created")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="tasks_assigned")
    lead = relationship("User", foreign_keys=[lead_id])
    team_approver = relationship("User", foreign_keys=[team_approved_by])

    # Project relationship
    project = relationship("Project", back_populates="tasks")

    # Team members relationship
    team_members = relationship("TaskTeam", back_populates="task", cascade="all, delete-orphan")

    # Existing relationships
    attachments = relationship(
        "Attachment", back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )
    subtasks = relationship("SubTask", back_populates="task", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="task", cascade="all, delete-orphan")
