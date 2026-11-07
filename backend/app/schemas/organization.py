from datetime import datetime
from pydantic import BaseModel, field_validator


def _clean(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class _Named(BaseModel):
    @field_validator("name", check_fields=False)
    @classmethod
    def _name_required(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("code", "description", check_fields=False)
    @classmethod
    def _blank_to_none(cls, v):
        return _clean(v)


class RefOut(BaseModel):
    id: int
    name: str
    code: str | None = None


# ---------- Areas
class AreaCreate(_Named):
    name: str
    code: str | None = None
    description: str | None = None
    is_active: bool = True


class AreaUpdate(_Named):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None


class AreaOut(BaseModel):
    id: int
    name: str
    code: str | None
    description: str | None
    is_active: bool
    station_count: int
    stations: list[RefOut] = []
    created_at: datetime


# ---------- Stations
class StationCreate(_Named):
    name: str
    code: str | None = None
    description: str | None = None
    area_id: int
    department_ids: list[int] = []
    is_active: bool = True


class StationUpdate(_Named):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    area_id: int | None = None
    department_ids: list[int] | None = None  # None = leave unchanged
    is_active: bool | None = None


class StationOut(BaseModel):
    id: int
    name: str
    code: str | None
    description: str | None
    is_active: bool
    area: RefOut
    departments: list[RefOut]
    created_at: datetime


# ---------- Divisions
class DivisionCreate(_Named):
    name: str
    description: str | None = None
    is_active: bool = True


class DivisionUpdate(_Named):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DivisionOut(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
