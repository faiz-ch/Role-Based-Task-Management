from datetime import datetime

from pydantic import BaseModel

from app.models.task import TaskStatus, TaskPriority


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: datetime | None = None
    assigned_to: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    due_date: datetime | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskAssignRequest(BaseModel):
    assigned_to: int | None = None


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

    class Config:
        from_attributes = True
