"""
SubTask model. Subtasks belong to a task and can have multiple assignees.
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.task import TaskStatus, TaskPriority


class SubTaskAssignee(Base):
    """
    Association table for subtask assignees with metadata.
    Tracks who assigned each user and when.
    """
    __tablename__ = "subtask_assignee"

    subtask_id = Column(Integer, ForeignKey("subtasks.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    subtask = relationship("SubTask", back_populates="assignees")
    user = relationship("User", foreign_keys=[user_id])
    assigner = relationship("User", foreign_keys=[assigned_by])


class SubTask(Base):
    __tablename__ = "subtasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.TODO, nullable=False)
    priority = Column(Enum(TaskPriority), default=TaskPriority.MEDIUM, nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships
    task = relationship("Task", back_populates="subtasks")
    creator = relationship("User", foreign_keys=[created_by])
    assignees = relationship("SubTaskAssignee", back_populates="subtask", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="subtask", cascade="all, delete-orphan")
