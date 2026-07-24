"""
Project model. Projects can span multiple departments and have a team of members.
Projects contain tasks, which can have subtasks.
"""
import enum

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, Table, func
from sqlalchemy.orm import relationship

from app.database import Base


class ProjectStatus(str, enum.Enum):
    PLANNING = "Planning"
    ACTIVE = "Active"
    DONE = "Done"
    ARCHIVED = "Archived"


class ProjectPriority(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


# Many-to-many association table for projects and departments
# A project can span multiple departments
project_department = Table(
    "project_department",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", Integer, ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
)


class ProjectTeam(Base):
    """
    Association table for project team members with metadata.
    Tracks who added each team member and when.
    """
    __tablename__ = "project_team"

    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="team_members")
    user = relationship("User", foreign_keys=[user_id])
    adder = relationship("User", foreign_keys=[added_by])


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.PLANNING, nullable=False)
    priority = Column(Enum(ProjectPriority), default=ProjectPriority.MEDIUM, nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    lead_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_approved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships - must specify foreign_keys= since multiple FKs point to User
    creator = relationship("User", foreign_keys=[created_by])
    lead = relationship("User", foreign_keys=[lead_id])
    team_approver = relationship("User", foreign_keys=[team_approved_by])

    # Many-to-many relationships
    departments = relationship("Department", secondary=project_department, back_populates="projects")
    team_members = relationship("ProjectTeam", back_populates="project", cascade="all, delete-orphan")

    # One-to-many relationship with tasks
    tasks = relationship("Task", back_populates="project")
