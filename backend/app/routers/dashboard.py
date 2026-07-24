from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user, has_permission, get_scoped_department_ids, can_view_task
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "dashboard:view"):
        raise HTTPException(status_code=403, detail="You do not have permission to view the dashboard")

    # Load all tasks with relationships needed for cascade checks
    query = select(Task).options(
        selectinload(Task.project).selectinload(Project.departments),
        selectinload(Task.team_members),
    )
    result = await db.execute(query)
    all_tasks = result.scalars().all()

    # Filter by cascade logic
    visible_tasks = [task for task in all_tasks if can_view_task(current_user, task)]

    # Calculate stats from filtered tasks
    status_counts = {}
    for task in visible_tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1

    overdue_count = sum(
        1 for task in visible_tasks
        if task.due_date and task.due_date < datetime.now(timezone.utc) and task.status != TaskStatus.DONE
    )

    return {
        "total_tasks": len(visible_tasks),
        "by_status": status_counts,
        "overdue_count": overdue_count,
    }