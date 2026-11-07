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
    station_ids: List[int] = Field(..., min_length=1, description="At least one station is required")
    department_ids: List[int] = Field(..., min_length=1, description="At least one department is required")
    division_ids: List[int] = []
    lead_id: int | None = None
    team_user_ids: List[int] | None = None


class ProjectStationOut(BaseModel):
    id: int
    name: str
    code: str | None = None
    area_id: int


class ProjectDivisionOut(BaseModel):
    id: int
    name: str


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
    station_ids: List[int] = []
    stations: List[ProjectStationOut] = []
    division_ids: List[int] = []
    divisions: List[ProjectDivisionOut] = []
    team_user_ids: List[int]
    team_members: List[TeamMemberOut] = []
    closing_notes: str | None
    reopened_reason: str | None
    reopened_by: int | None
    reopened_at: datetime | None
    # Task progress, so the projects list does not have to download every task
    task_count: int = 0
    done_task_count: int = 0

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
    station_ids: List[int] | None = None
    department_ids: List[int] | None = None
    division_ids: List[int] | None = None


class ProjectRejectRequest(BaseModel):
    reason: str
