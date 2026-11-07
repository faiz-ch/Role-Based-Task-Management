"""
User model. Each user has exactly ONE role (you chose this — simpler
than many-to-many). role_id can be null temporarily (e.g. a brand new
user before an admin assigns them a role). Similarly, department_id
is optional for organizational grouping.
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Date, func, Table, false
from sqlalchemy.orm import relationship

from app.database import Base

user_managed_department = Table(
    "user_managed_department",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("department_id", ForeignKey("departments.id"), primary_key=True),
)

# What a user MANAGES, at three levels (Phase 2):
#   a whole Area    -> every station in it, including stations added later
#   a whole Station -> every department at that station, including later ones
#   a Department    -> just that department
# The effective scope is the union, as a set of department ids
# (core/deps.py -> get_scoped_department_ids).
user_managed_area = Table(
    "user_managed_area",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("area_id", Integer, ForeignKey("areas.id", ondelete="CASCADE"), primary_key=True),
)
user_managed_station = Table(
    "user_managed_station",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("station_id", Integer, ForeignKey("stations.id", ondelete="CASCADE"), primary_key=True),
)

# Per-user EXTRA roles this user may assign, on top of their role's base
# assignable list. Lets one Department Head assign e.g. "Lab Technician"
# without every Department Head getting that ability.
user_extra_assignable_role = Table(
    "user_extra_assignable_role",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)  # NEVER store plain passwords
    # Numbers only, unique. Required for every new user; only the main Admin may be without one.
    employee_code = Column(String(20), unique=True, index=True, nullable=True)
    joining_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    role = relationship("Role", back_populates="users", foreign_keys=[role_id])

    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    department = relationship("Department", back_populates="users", foreign_keys=[department_id])

    # Placement: where the person works (one per person). department_id above is the
    # placement department; it must be one of the station's departments.
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=True, index=True)
    area = relationship("Area", foreign_keys=[area_id])
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True, index=True)
    station = relationship("Station", foreign_keys=[station_id])
    division_id = Column(Integer, ForeignKey("divisions.id"), nullable=True, index=True)
    division = relationship("Division", foreign_keys=[division_id])

    manage_all_departments = Column(Boolean, nullable=False, default=False, server_default=false())
    managed_departments = relationship("Department", secondary=user_managed_department)
    managed_areas = relationship("Area", secondary=user_managed_area, passive_deletes=True)
    managed_stations = relationship("Station", secondary=user_managed_station, passive_deletes=True)
    extra_assignable_roles = relationship("Role", secondary=user_extra_assignable_role)

    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    manager = relationship("User", remote_side=[id], foreign_keys=[manager_id])

    avatar_path = Column(String, nullable=True)

    @property
    def scope_department_ids(self) -> list[int]:
        """Departments covered by what this user manages (whole areas, whole stations,
        single departments). Needs scope_load_options() loaded."""
        ids = {d.id for d in self.managed_departments}
        for st in self.managed_stations:
            ids |= {d.id for d in st.departments}
        for area in self.managed_areas:
            for st in area.stations:
                ids |= {d.id for d in st.departments}
        return sorted(ids)

    @property
    def has_avatar(self) -> bool:
        return self.avatar_path is not None

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
