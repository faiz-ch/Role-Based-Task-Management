from datetime import datetime
from pydantic import BaseModel


class AttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by: int
    uploaded_at: datetime

    class Config:
        from_attributes = True
