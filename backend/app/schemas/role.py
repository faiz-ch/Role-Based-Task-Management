from pydantic import BaseModel
from typing import Optional


class PermissionOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class DepartmentOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class CategoryOut(BaseModel):
    id: int
    name: str
    permissions: list[PermissionOut] = []

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str
    category_id: int | None = None
    all_departments: bool = False
    department_ids: list[int] = []
    assignable_category_ids: list[int] = []
    notify_on_assign: bool = False
    notify_on_review: bool = False
    notify_on_reschedule: bool = False
    notify_on_done: bool = False


class RoleOut(BaseModel):
    id: int
    name: str
    category: CategoryOut | None = None
    all_departments: bool = False
    departments: list[DepartmentOut] = []
    assignable_categories: list[CategoryOut] = []
    notify_on_assign: bool = False
    notify_on_review: bool = False
    notify_on_reschedule: bool = False
    notify_on_done: bool = False

    class Config:
        from_attributes = True


class SetRoleCategoryRequest(BaseModel):
    category_id: int | None


class SetRoleNotificationsRequest(BaseModel):
    notify_on_assign: bool = False
    notify_on_review: bool = False
    notify_on_reschedule: bool = False
    notify_on_done: bool = False
