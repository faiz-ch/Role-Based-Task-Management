from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime, CheckConstraint, func
from sqlalchemy.orm import relationship
from app.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    subtask_id = Column(Integer, ForeignKey("subtasks.id", ondelete="CASCADE"), nullable=True)
    content = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "(project_id IS NOT NULL)::int + (task_id IS NOT NULL)::int + (subtask_id IS NOT NULL)::int = 1",
            name="report_exactly_one_parent"
        ),
    )

    author = relationship("User", foreign_keys=[created_by])
    project = relationship("Project", back_populates="reports")
    task = relationship("Task", back_populates="reports")
    subtask = relationship("SubTask", back_populates="reports")
