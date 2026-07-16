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
    departments: list[DepartmentOut] = []
    assignable_category_ids: list[int] = []

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str
    category_id: int | None = None


class RoleOut(BaseModel):
    id: int
    name: str
    category: CategoryOut | None = None

    class Config:
        from_attributes = True


class SetRoleCategoryRequest(BaseModel):
    category_id: int | None
