"""
Department model. A simple standalone entity that groups users and tasks
for organizational purposes. Each user and task can optionally belong to
one department (nullable foreign key).
"""
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    # A department can have many users and many tasks.
    users = relationship("User", back_populates="department")
    tasks = relationship("Task", back_populates="department")
    projects = relationship("Project", secondary="project_department", back_populates="departments")
