"""
Category model.

A Category is a named bundle of permissions that roles can inherit from.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship

from app.database import Base

category_permission = Table(
    "category_permission",
    Base.metadata,
    Column("category_id", Integer, ForeignKey("categories.id"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id"), primary_key=True),
)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    permissions = relationship("Permission", secondary=category_permission)
    roles = relationship("Role", back_populates="category")
