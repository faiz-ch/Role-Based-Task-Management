"""
Role and Permission models.

Role now inherits permissions from its Category. The role_permission join table
has been removed in favor of the category-based permission system.
"""
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "Team Lead" — custom, admin-created
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    category = relationship("Category", back_populates="roles")
    users = relationship("User", back_populates="role")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    # Fixed list, e.g. "task:create", "task:assign", "role:manage" —
    # these come from OUR code (seeded once), never created by the admin user.
    name = Column(String, unique=True, nullable=False)
