"""
Milestone model. Milestones are key achievements or checkpoints within a project.
They track the progress of a project towards completion.
"""
import enum

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, func
from sqlalchemy.orm import relationship

from app.database import Base


class MilestoneStatus(str, enum.Enum):
    PLANNED = "Planned"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    DELAYED = "Delayed"


class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(MilestoneStatus), default=MilestoneStatus.PLANNED, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="milestones")
    creator = relationship("User")
