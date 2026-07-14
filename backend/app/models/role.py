"""
Role and Permission models.

RolePermission is a "join table" — it just connects Role <-> Permission
in a many-to-many way (one role can have many permissions, and in theory
the same permission could apply to many roles). It has no other data of
its own, so we model it as a plain Table, not a full class.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship

from app.database import Base

role_permission = Table(
    "role_permission",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "Team Lead" — custom, admin-created

    # secondary=role_permission tells SQLAlchemy "to get from a Role to its
    # Permissions, go through the role_permission table."
    permissions = relationship(
        "Permission", secondary=role_permission, back_populates="roles"
    )
    users = relationship("User", back_populates="role")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    # Fixed list, e.g. "task:create", "task:assign", "role:manage" —
    # these come from OUR code (seeded once), never created by the admin user.
    name = Column(String, unique=True, nullable=False)

    roles = relationship(
        "Role", secondary=role_permission, back_populates="permissions"
    )
