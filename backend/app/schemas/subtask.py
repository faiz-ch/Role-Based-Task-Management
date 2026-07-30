from datetime import datetime
from typing import List

from pydantic import BaseModel

from app.models.task import TaskStatus, TaskPriority


class SubtaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: datetime | None = None
    assignee_ids: List[int] = []


class SubtaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    due_date: datetime | None = None


class SubtaskStatusUpdate(BaseModel):
    status: TaskStatus
    comment: str | None = None
    due_date: datetime | None = None


class SubtaskAssigneeUpdate(BaseModel):
    user_ids: List[int]


class SubtaskOut(BaseModel):
    id: int
    task_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    due_date: datetime | None
    created_by: int
    created_at: datetime
    assignee_ids: List[int]

    class Config:
        from_attributes = True
