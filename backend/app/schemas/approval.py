from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAX_AMOUNT = Decimal("999999999999.99")


class PersonRef(BaseModel):
    id: int
    name: str
    email: str | None = None


class RoleRef(BaseModel):
    id: int
    name: str


class ApprovalTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    requires_amount: bool = False
    requires_attachment: bool = False
    mandatory: bool = False
    is_active: bool = True
    role_ids: list[int] = []
    user_ids: list[int] = []

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        return (v or "").strip() or None


class ApprovalTypeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    description: str | None = None
    requires_amount: bool | None = None
    requires_attachment: bool | None = None
    mandatory: bool | None = None
    is_active: bool | None = None
    role_ids: list[int] | None = None
    user_ids: list[int] | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class ApprovalTypeOut(BaseModel):
    id: int
    key: str | None
    name: str
    description: str | None
    is_builtin: bool
    requires_amount: bool
    requires_attachment: bool
    mandatory: bool
    is_active: bool
    roles: list[RoleRef]
    users: list[PersonRef]
    in_use: int = 0  # number of projects that use it


class ApproverOptions(BaseModel):
    roles: list[dict]   # [{id, name, members: [{id, name, email}]}]
    users: list[dict]   # [{id, name, email, role}]


class ProjectApprovalsSet(BaseModel):
    approval_type_ids: list[int]


class DecisionIn(BaseModel):
    action: Literal["approve", "reject", "send_back"]
    comment: str | None = Field(default=None, max_length=4000)
    approved_amount: Decimal | None = None

    @field_validator("approved_amount")
    @classmethod
    def _amt(cls, v):
        if v is None:
            return v
        if v <= 0 or v > MAX_AMOUNT:
            raise ValueError("Approved amount must be more than 0")
        if v.as_tuple().exponent < -2:
            raise ValueError("Use at most 2 decimal places")
        return v


class ApprovalEventOut(BaseModel):
    id: int
    action: str
    actor: PersonRef | None
    amount: float | None
    comment: str | None
    attachment_name: str | None
    created_at: datetime


class ProjectApprovalOut(BaseModel):
    id: int
    project_id: int
    project_name: str | None = None
    type: ApprovalTypeOut
    status: str
    amount: float | None
    approved_amount: float | None
    reason: str | None
    attachment_name: str | None
    requested_by: PersonRef | None
    requested_at: datetime | None
    decided_by: PersonRef | None
    decided_at: datetime | None
    decision_comment: str | None
    events: list[ApprovalEventOut] = []
    can_request: bool = False
    can_decide: bool = False
    approvers: list[PersonRef] = []
    approver_is_admin_fallback: bool = False
    can_open_project: bool = True


class ApprovalsMe(BaseModel):
    is_approver: bool
    pending_count: int
