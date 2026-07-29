from datetime import datetime
from pydantic import BaseModel


class ActivityLogOut(BaseModel):
    actor_id: int
    action: str
    detail: str | None
    created_at: datetime

    class Config:
        from_attributes = True
