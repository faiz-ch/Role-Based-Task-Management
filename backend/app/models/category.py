"""
Category model.

A Category is a named bundle of permissions and departments that roles can inherit from.
It also defines which other categories it's allowed to assign when creating/editing users.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship

from app.database import Base

category_department = Table(
    "category_department",
    Base.metadata,
    Column("category_id", Integer, ForeignKey("categories.id"), primary_key=True),
    Column("department_id", ForeignKey("departments.id"), primary_key=True),
)

category_permission = Table(
    "category_permission",
    Base.metadata,
    Column("category_id", Integer, ForeignKey("categories.id"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id"), primary_key=True),
)

category_assignable_category = Table(
    "category_assignable_category",
    Base.metadata,
    Column("category_id", Integer, ForeignKey("categories.id"), primary_key=True),
    Column("assignable_category_id", Integer, ForeignKey("categories.id"), primary_key=True),
)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    permissions = relationship("Permission", secondary=category_permission)
    departments = relationship("Department", secondary=category_department)
    # Categories this category is allowed to hand out when creating/assigning users.
    # Self-referential many-to-many — a category assigning itself is valid (peer creation).
    assignable_categories = relationship(
        "Category",
        secondary=category_assignable_category,
        primaryjoin=id == category_assignable_category.c.category_id,
        secondaryjoin=id == category_assignable_category.c.assignable_category_id,
    )
    roles = relationship("Role", back_populates="category")
