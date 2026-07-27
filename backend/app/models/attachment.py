"""
Attachment model. Each row is one uploaded file, linked to the task it
belongs to. A task can have many attachments (one-to-many) — that's why
this is its own table rather than columns on Task, since a fixed set of
columns can't hold "however many files someone uploads."
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship

from app.database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    subtask_id = Column(Integer, ForeignKey("subtasks.id", ondelete="CASCADE"), nullable=True)
    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    preview_path = Column(String, nullable=True)

    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")