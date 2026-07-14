from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("dashboard:view")),
):
    # One query: count of tasks grouped by status, e.g. {"To Do": 5, "Done": 12}
    status_counts_result = await db.execute(
        select(Task.status, func.count(Task.id)).group_by(Task.status)
    )
    status_counts = {status.value: count for status, count in status_counts_result.all()}

    overdue_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.due_date < datetime.now(timezone.utc),
            Task.status != TaskStatus.DONE,
        )
    )
    overdue_count = overdue_result.scalar_one()

    total_result = await db.execute(select(func.count(Task.id)))
    total_tasks = total_result.scalar_one()

    return {
        "total_tasks": total_tasks,
        "by_status": status_counts,
        "overdue_count": overdue_count,
    }
