"""
Activity logging service. Tracks user actions across projects, tasks, and subtasks.
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog

logger = logging.getLogger(__name__)


async def log_activity(
    db: AsyncSession,
    actor_id: int,
    action: str,
    entity_type: str,
    entity_id: int,
    detail: str | None = None,
) -> None:
    """
    Log an activity to the database. Never raises — if logging fails for any
    reason, this logs the problem and returns quietly instead of crashing the
    caller's request. Does NOT commit — the caller's existing db.commit() should
    cover it to avoid extra round-trips.
    """
    try:
        log_entry = ActivityLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail,
        )
        db.add(log_entry)
    except Exception:
        logger.exception(
            "Failed to log activity: actor_id=%s, action=%s, entity_type=%s, entity_id=%s",
            actor_id,
            action,
            entity_type,
            entity_id,
        )
