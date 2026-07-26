from datetime import datetime
from typing import List

from pydantic import BaseModel, Field

from app.models.task import TaskPriority


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: datetime | None = None
    department_ids: List[int] = Field(..., min_length=1, description="At least one department is required")


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    priority: str
    created_by: int
    lead_id: int | None
    team_approved_by: int | None
    team_approved_at: datetime | None
    due_date: datetime | None
    created_at: datetime
    department_ids: List[int]
    team_user_ids: List[int]

    class Config:
        from_attributes = True


class ProjectTeamUpdate(BaseModel):
    user_ids: List[int]
    lead_id: int | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    priority: str | None = None
    due_date: datetime | None = None
    department_ids: List[int] | None = None
