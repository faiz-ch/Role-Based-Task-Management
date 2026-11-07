from datetime import datetime
from pydantic import BaseModel


class DepartmentHeadOut(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True


class DepartmentStationOut(BaseModel):
    id: int
    name: str
    code: str | None = None

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    description: str | None = None
    head_id: int | None = None
    color: str = "purple"
    is_active: bool = True
    station_ids: list[int] = []


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    head_id: int | None = None
    color: str | None = None
    is_active: bool | None = None
    station_ids: list[int] | None = None  # None = leave unchanged


class DepartmentOut(BaseModel):
    id: int
    name: str
    description: str | None
    head_id: int | None
    head: DepartmentHeadOut | None
    color: str
    is_active: bool
    member_count: int
    project_count: int
    created_at: datetime
    stations: list[DepartmentStationOut] = []

    class Config:
        from_attributes = True


class DepartmentDeleteRequest(BaseModel):
    move_users_to: int | None = None
    move_projects_to: int | None = None
