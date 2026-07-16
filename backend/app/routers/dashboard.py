from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_permission, get_current_user, get_permission_tier, get_scoped_department_ids
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    view_tier = get_permission_tier(current_user, "dashboard:view_all", "dashboard:view_department")
    
    if view_tier == "none":
        raise HTTPException(status_code=403, detail="You do not have permission to view the dashboard")
    
    # Apply department filter for department-tier users
    dept_filter = None
    if view_tier == "department":
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if not scoped_dept_ids:
            dept_filter = Task.department_id == -1  # No departments = no results
        else:
            dept_filter = Task.department_id.in_(scoped_dept_ids)
    
    # One query: count of tasks grouped by status, e.g. {"To Do": 5, "Done": 12}
    status_query = select(Task.status, func.count(Task.id)).group_by(Task.status)
    if dept_filter is not None:
        status_query = status_query.where(dept_filter)
    status_counts_result = await db.execute(status_query)
    status_counts = {status.value: count for status, count in status_counts_result.all()}

    overdue_query = select(func.count(Task.id)).where(
        Task.due_date < datetime.now(timezone.utc),
        Task.status != TaskStatus.DONE,
    )
    if dept_filter is not None:
        overdue_query = overdue_query.where(dept_filter)
    overdue_result = await db.execute(overdue_query)
    overdue_count = overdue_result.scalar_one()

    total_query = select(func.count(Task.id))
    if dept_filter is not None:
        total_query = total_query.where(dept_filter)
    total_result = await db.execute(total_query)
    total_tasks = total_result.scalar_one()

    return {
        "total_tasks": total_tasks,
        "by_status": status_counts,
        "overdue_count": overdue_count,
    }
