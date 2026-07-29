"""
ActivityLog model for tracking user actions across projects, tasks, and subtasks.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=False)
    detail = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    actor = relationship("User", foreign_keys=[actor_id])
