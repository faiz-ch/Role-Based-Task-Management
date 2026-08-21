from datetime import datetime
from typing import List

from pydantic import BaseModel, Field

from app.models.project import ProjectPriority


class LeadOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class TeamMemberOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    priority: ProjectPriority = ProjectPriority.MEDIUM
    start_date: datetime | None = None
    due_date: datetime | None = None
    color: str | None = None
    department_ids: List[int] = Field(..., min_length=1, description="At least one department is required")
    lead_id: int | None = None
    team_user_ids: List[int] | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    priority: str
    start_date: datetime | None
    due_date: datetime | None
    color: str | None
    created_by: int
    lead_id: int | None
    lead: LeadOut | None = None
    team_approved_by: int | None
    team_approved_at: datetime | None
    created_at: datetime
    completed_at: datetime | None
    department_ids: List[int]
    team_user_ids: List[int]
    team_members: List[TeamMemberOut] = []
    closing_notes: str | None
    reopened_reason: str | None
    reopened_by: int | None
    reopened_at: datetime | None

    class Config:
        from_attributes = True


class ProjectTeamUpdate(BaseModel):
    user_ids: List[int]
    lead_id: int | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    priority: str | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    color: str | None = None
    department_ids: List[int] | None = None


class ProjectRejectRequest(BaseModel):
    reason: str
