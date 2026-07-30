from datetime import datetime
from typing import List

from pydantic import BaseModel

from app.models.task import TaskStatus, TaskPriority


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: datetime | None = None
    project_id: int | None = None
    assigned_to: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    due_date: datetime | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus
    due_date: datetime | None = None
    comment: str | None = None


class TaskAssignRequest(BaseModel):
    assigned_to: int | None = None


class TaskTeamUpdate(BaseModel):
    user_ids: List[int]
    lead_id: int | None = None


class AttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    due_date: datetime | None
    created_at: datetime
    created_by: int
    assigned_to: int | None
    project_id: int | None
    lead_id: int | None
    team_approved_by: int | None
    team_approved_at: datetime | None
    team_user_ids: List[int]
    attachments: list[AttachmentOut] = []

    class Config:
        from_attributes = True
