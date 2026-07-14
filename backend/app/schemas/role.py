from pydantic import BaseModel


class PermissionOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str


class RoleOut(BaseModel):
    id: int
    name: str
    permissions: list[PermissionOut] = []

    class Config:
        from_attributes = True


class SetRolePermissionsRequest(BaseModel):
    permission_ids: list[int]
