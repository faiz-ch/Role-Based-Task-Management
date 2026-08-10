"""
User model. Each user has exactly ONE role (you chose this — simpler
than many-to-many). role_id can be null temporarily (e.g. a brand new
user before an admin assigns them a role). Similarly, department_id
is optional for organizational grouping.
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)  # NEVER store plain passwords
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    role = relationship("Role", back_populates="users", foreign_keys=[role_id])

    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    department = relationship("Department", back_populates="users", foreign_keys=[department_id])

    # A user can have created many tasks, and separately, been assigned many tasks.
    # foreign_keys= is needed here because Task has TWO foreign keys pointing
    # to User (created_by and assigned_to) — without this, SQLAlchemy can't
    # guess which one each relationship refers to.
    tasks_created = relationship(
        "Task", foreign_keys="Task.created_by", back_populates="creator"
    )
    tasks_assigned = relationship(
        "Task", foreign_keys="Task.assigned_to", back_populates="assignee"
    )
