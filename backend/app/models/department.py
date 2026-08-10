"""
Department model. A simple standalone entity that groups users and tasks
for organizational purposes. Each user and task can optionally belong to
one department (nullable foreign key).
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    head_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    color = Column(String, nullable=False, default="purple")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # A department can have many users and many projects.
    users = relationship("User", back_populates="department", foreign_keys="User.department_id")
    projects = relationship("Project", secondary="project_department", back_populates="departments")
    head = relationship("User", foreign_keys=[head_id])
