from datetime import datetime
from pydantic import BaseModel

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

class RoleBrief(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class RoleCreatorOut(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    color: str = "blue"
    is_active: bool = True
    is_system: bool = False
    category_id: int | None = None  # optional preset, copies its permissions once
    permission_ids: list[int] = []  # explicit permissions; if empty and category_id given, copy from category
    all_departments: bool = False
    department_ids: list[int] = []
    assignable_role_ids: list[int] = []

class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    is_active: bool | None = None
    is_system: bool | None = None
    permission_ids: list[int] | None = None
    all_departments: bool | None = None
    department_ids: list[int] | None = None
    assignable_role_ids: list[int] | None = None

class RoleOut(BaseModel):
    id: int
    name: str
    description: str | None
    color: str
    is_active: bool
    is_system: bool
    created_by: int | None
    creator: RoleCreatorOut | None
    created_at: datetime
    updated_at: datetime
    permissions: list[PermissionOut] = []
    all_departments: bool = False
    departments: list[DepartmentOut] = []
    assignable_roles: list[RoleBrief] = []
    user_count: int
    class Config:
        from_attributes = True
