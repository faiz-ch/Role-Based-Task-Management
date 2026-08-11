from datetime import datetime
from typing import List, TYPE_CHECKING

from pydantic import BaseModel

from app.models.subtask import SubTaskStatus, SubTaskPriority

if TYPE_CHECKING:
    from app.schemas.attachment import AttachmentOut


class SubtaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: SubTaskPriority = SubTaskPriority.MEDIUM
    due_date: datetime | None = None
    assigned_to: int | None = None


class SubtaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: SubTaskPriority | None = None
    due_date: datetime | None = None


class SubtaskStatusUpdate(BaseModel):
    status: SubTaskStatus
    due_date: datetime | None = None
    comment: str | None = None


class SubtaskAssignRequest(BaseModel):
    assigned_to: int | None = None


class SubtaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    status: SubTaskStatus
    priority: SubTaskPriority
    due_date: datetime | None
    created_at: datetime
    created_by: int
    assigned_to: int | None
    task_id: int
    assignee_ids: List[int] = []
    attachments: list["AttachmentOut"] = []

    class Config:
        from_attributes = True
