from datetime import datetime
from pydantic import BaseModel, field_validator


class CommentCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Content cannot be empty or whitespace-only")
        return v


class CommentOut(BaseModel):
    id: int
    author_id: int
    content: str
    action: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
