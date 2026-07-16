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


class CategoryCreate(BaseModel):
    name: str
    permission_ids: list[int] = []
    department_ids: list[int] = []
    assignable_category_ids: list[int] = []


class CategoryUpdate(BaseModel):
    name: str | None = None
    permission_ids: list[int] | None = None
    department_ids: list[int] | None = None
    assignable_category_ids: list[int] | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    permissions: list[PermissionOut] = []
    departments: list[DepartmentOut] = []
    assignable_category_ids: list[int] = []

    class Config:
        from_attributes = True
