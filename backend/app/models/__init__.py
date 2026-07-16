"""
Importing all models here means one `import app.models` line elsewhere
registers everything with SQLAlchemy's Base.metadata — needed so
Base.metadata.create_all() (and later, Alembic migrations) knows about
every table.
"""
from app.models.user import User
from app.models.role import Role, Permission
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.department import Department
from app.models.category import Category, category_department, category_permission, category_assignable_category
