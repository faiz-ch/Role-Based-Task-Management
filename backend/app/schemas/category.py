from pydantic import BaseModel


class PermissionOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str
    permission_ids: list[int] = []


class CategoryUpdate(BaseModel):
    name: str | None = None
    permission_ids: list[int] | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    permissions: list[PermissionOut] = []

    class Config:
        from_attributes = True
