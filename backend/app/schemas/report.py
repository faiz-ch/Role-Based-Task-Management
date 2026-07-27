from datetime import datetime
from pydantic import BaseModel


class ReportCreate(BaseModel):
    content: str


class ReportOut(BaseModel):
    id: int
    project_id: int | None
    task_id: int | None
    subtask_id: int | None
    content: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True
