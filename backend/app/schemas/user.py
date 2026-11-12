from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime, date
import re
from app.schemas.role import PermissionOut


class DepartmentBrief(BaseModel):
    id: int
    name: str
    color: str
    is_active: bool

    class Config:
        from_attributes = True


class OrgBrief(BaseModel):
    id: int
    name: str
    code: str | None = None

    class Config:
        from_attributes = True


class StationBrief(OrgBrief):
    area_id: int


class PairIn(BaseModel):
    """One department AT one station."""
    station_id: int
    department_id: int


class ManagedPairOut(BaseModel):
    station: StationBrief
    department: OrgBrief

    class Config:
        from_attributes = True


_CODE_RE = re.compile(r"^\d{1,20}$")


def clean_employee_code(v):
    """Numbers only (leading zeros kept), up to 20 digits. Blank -> None."""
    if v is None:
        return None
    v = str(v).strip()
    if not v:
        return None
    if not _CODE_RE.match(v):
        raise ValueError("Employee Code must contain numbers only (up to 20 digits)")
    return v


class RoleBriefMinimal(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class RoleBrief(BaseModel):
    id: int
    name: str
    color: str
    is_active: bool
    is_system: bool = False  # True = the built-in main Admin role
    permissions: list[PermissionOut] = []
    all_roles: bool = False
    assignable_roles: list[RoleBriefMinimal] = []

    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    id: int
    name: str
    email: str
    has_avatar: bool = False

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    """
    What we send BACK to the client. Notice: no password field here at all —
    this is what stops us from ever accidentally leaking a password hash.
    """
    id: int
    name: str
    email: EmailStr
    is_active: bool
    employee_code: str | None = None
    joining_date: date | None = None
    designation: str | None = None  # job title, separate from the role
    role: RoleBrief | None = None
    # Placement (where the person works)
    area: OrgBrief | None = None
    station: StationBrief | None = None
    department: DepartmentBrief | None = None
    division: OrgBrief | None = None
    # What the person manages
    manage_all_departments: bool = False
    managed_areas: list[OrgBrief] = []
    managed_stations: list[StationBrief] = []
    managed_pairs: list[ManagedPairOut] = []  # single departments, each at a station
    scope_pairs: list[str] = []  # everything the above covers, as "station:department"
    scope_department_ids: list[int] = []
    extra_assignable_roles: list[RoleBriefMinimal] = []
    created_at: datetime
    manager: UserBrief | None = None
    has_avatar: bool = False

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """
    Partial update: only fields the client actually SENDS are applied
    (checked with model_fields_set in the router). This matters — with
    non-None defaults, editing just a user's name used to silently wipe
    their department scope.
    department_id / manager_id may be sent as null to clear them.
    """
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    is_active: bool | None = None
    employee_code: str | None = None
    joining_date: date | None = None
    designation: str | None = None  # job title, separate from the role
    area_id: int | None = None
    station_id: int | None = None
    department_id: int | None = None
    division_id: int | None = None
    manager_id: int | None = None
    manage_all_departments: bool | None = None
    managed_area_ids: list[int] | None = None
    managed_station_ids: list[int] | None = None
    managed_pairs: list[PairIn] | None = None
    extra_assignable_role_ids: list[int] | None = None

    @field_validator("employee_code", mode="before")
    @classmethod
    def _code(cls, v):
        return clean_employee_code(v)

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class AssignRoleRequest(BaseModel):
    role_id: int | None = None


class AssignDepartmentRequest(BaseModel):
    department_id: int | None = None


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    employee_code: str
    joining_date: date | None = None
    designation: str | None = None  # job title, separate from the role
    role_id: int | None = None
    # Placement: Area, Station and Department are required; Division is optional
    area_id: int
    station_id: int
    department_id: int
    division_id: int | None = None
    is_active: bool = True
    manage_all_departments: bool = False
    managed_area_ids: list[int] = []
    managed_station_ids: list[int] = []
    managed_pairs: list[PairIn] = []
    extra_assignable_role_ids: list[int] = []
    send_welcome_email: bool = True

    @field_validator("employee_code", mode="before")
    @classmethod
    def _code_required(cls, v):
        v = clean_employee_code(v)
        if v is None:
            raise ValueError("Employee Code is required")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class PerformanceCategoryOut(BaseModel):
    total: int
    completed: int
    on_time: int
    late: int
    overdue: int
    pending: int


class UserPerformanceOut(BaseModel):
    projects: PerformanceCategoryOut
    tasks: PerformanceCategoryOut
    subtasks: PerformanceCategoryOut

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        return v


def clean_designation(v):
    """Trim; empty -> None; at most 120 characters."""
    if v is None:
        return None
    v = " ".join(str(v).split())
    if len(v) > 120:
        raise ValueError("Designation is too long (120 characters at most)")
    return v or None
