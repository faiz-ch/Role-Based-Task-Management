"""
Role and Permission models.

Role has its own independent permissions and department scope.
Category is an optional one-time preset used only at role creation time.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Table, false, DateTime, func, Text
from sqlalchemy.orm import relationship

from app.database import Base

role_department = Table(
    "role_department",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("department_id", ForeignKey("departments.id"), primary_key=True),
)

role_permission = Table(
    "role_permission",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id"), primary_key=True),
)

role_assignable_role = Table(
    "role_assignable_role",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("assignable_role_id", Integer, ForeignKey("roles.id"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g. "Team Lead" — custom, admin-created
    description = Column(Text, nullable=True)
    color = Column(String, nullable=False, default="blue")
    is_active = Column(Boolean, nullable=False, default=True, server_default=false())
    is_system = Column(Boolean, nullable=False, default=False, server_default=false())
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    all_departments = Column(Boolean, nullable=False, default=False, server_default=false())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="roles")
    departments = relationship("Department", secondary=role_department)
    permissions = relationship("Permission", secondary=role_permission)
    assignable_roles = relationship(
        "Role", secondary=role_assignable_role,
        primaryjoin="Role.id == role_assignable_role.c.role_id",
        secondaryjoin="Role.id == role_assignable_role.c.assignable_role_id",
    )
    creator = relationship("User", foreign_keys=[created_by])
    users = relationship("User", back_populates="role", foreign_keys="User.role_id")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    # Fixed list, e.g. "task:create", "task:assign", "role:manage" —
    # these come from OUR code (seeded once), never created by the admin user.
    name = Column(String, unique=True, nullable=False)
