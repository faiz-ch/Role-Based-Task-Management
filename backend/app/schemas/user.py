from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.department import DepartmentOut
from app.schemas.role import RoleOut


class UserOut(BaseModel):
    """
    What we send BACK to the client. Notice: no password field here at all —
    this is what stops us from ever accidentally leaking a password hash.
    """
    id: int
    name: str
    email: EmailStr
    is_active: bool
    role: RoleOut | None = None
    department: DepartmentOut | None = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    is_active: bool | None = None
    department_id: int | None = None

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
    role_id: int | None = None
    department_id: int | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v