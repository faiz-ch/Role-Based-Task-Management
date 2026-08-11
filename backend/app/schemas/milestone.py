from datetime import datetime
from typing import List

from pydantic import BaseModel

from app.models.milestone import MilestoneStatus


class MilestoneCreate(BaseModel):
    title: str
    description: str | None = None
    due_date: datetime | None = None
    status: MilestoneStatus = MilestoneStatus.PLANNED


class MilestoneUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    status: MilestoneStatus | None = None


class MilestoneOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    due_date: datetime | None
    status: MilestoneStatus
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True
