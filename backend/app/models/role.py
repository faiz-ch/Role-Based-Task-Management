"""
Role and Permission models.

Role inherits permissions from its Category and has its own department scope
and assignable categories.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Table, false
from sqlalchemy.orm import relationship

from app.database import Base

role_department = Table(
    "role_department",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("department_id", ForeignKey("departments.id"), primary_key=True),
)

role_assignable_category = Table(
    "role_assignable_category",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "Team Lead" — custom, admin-created
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    all_departments = Column(Boolean, nullable=False, default=False, server_default=false())
    # Email notification preferences: whether users holding this Role get
    # emailed when a task in their department(s) hits each of these events.
    # Kept on Role (not Category) since department scope already lives here.
    notify_on_assign = Column(Boolean, nullable=False, default=False, server_default=false())
    notify_on_review = Column(Boolean, nullable=False, default=False, server_default=false())
    notify_on_reschedule = Column(Boolean, nullable=False, default=False, server_default=false())
    notify_on_done = Column(Boolean, nullable=False, default=False, server_default=false())

    category = relationship("Category", back_populates="roles")
    departments = relationship("Department", secondary=role_department)
    assignable_categories = relationship("Category", secondary=role_assignable_category)
    users = relationship("User", back_populates="role")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    # Fixed list, e.g. "task:create", "task:assign", "role:manage" —
    # these come from OUR code (seeded once), never created by the admin user.
    name = Column(String, unique=True, nullable=False)
