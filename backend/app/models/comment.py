"""
Comment model for adding simple text comments to tasks and subtasks.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    author = relationship("User", foreign_keys=[author_id])
