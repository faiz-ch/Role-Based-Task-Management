"""
Organisation structure.

    Area  1 ── * Station  * ── * Department        Division (independent)

- An Area (e.g. "RLK Associates Pvt Limited") has many Stations; each Station
  belongs to exactly one Area.
- A Station (e.g. HLTH) has many Departments and a Department can belong to
  several Stations (e.g. "S1 Surgery and Thoracic RLMC and AMTH").
- A Division (e.g. Campus 1) is independent; users and projects reference it.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Table, func
from sqlalchemy.orm import relationship

from app.database import Base

station_department = Table(
    "station_department",
    Base.metadata,
    Column("station_id", Integer, ForeignKey("stations.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", Integer, ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
)


class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    code = Column(String, unique=True, nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    stations = relationship("Station", back_populates="area", order_by="Station.name")


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    code = Column(String, unique=True, nullable=True)
    description = Column(Text, nullable=True)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    area = relationship("Area", back_populates="stations")
    departments = relationship(
        "Department", secondary=station_department, back_populates="stations", order_by="Department.name",
        passive_deletes=True,  # the database removes the links (ON DELETE CASCADE)
    )


class Division(Base):
    __tablename__ = "divisions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
