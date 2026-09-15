from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, has_permission, get_scoped_department_ids, can_view_task, can_view_subtask, is_project_lead
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.models.subtask import SubTask, SubTaskAssignee

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def user_is_manager(db: AsyncSession, current_user: User) -> bool:
    if has_permission(current_user, "project:manage"):
        return True
    led_result = await db.execute(
        select(func.count()).select_from(Project).where(Project.lead_id == current_user.id)
    )
    return (led_result.scalar() or 0) > 0


def is_overdue(due_date: datetime | None, now: datetime) -> bool:
    if not due_date:
        return False
    d = due_date
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d < now


def calc_days_overdue(due_date: datetime, now: datetime) -> int:
    d = due_date
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return max(1, (now - d).days)


def compute_overdue_tasks(tasks: list[Task], now: datetime) -> list[dict]:
    overdue = []
    for task in tasks:
        if task.status != TaskStatus.DONE and is_overdue(task.due_date, now):
            days_od = calc_days_overdue(task.due_date, now)
            overdue.append({
                "id": task.id,
                "title": task.title,
                "days_overdue": days_od,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value if hasattr(task.status, "value") else str(task.status),
                "project_id": task.project_id,
                "project_name": task.project.name if task.project else None,
            })
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return overdue


def compute_overdue_subtasks(subtasks: list[SubTask], now: datetime) -> list[dict]:
    overdue = []
    for subtask in subtasks:
        if subtask.status != TaskStatus.DONE and is_overdue(subtask.due_date, now):
            days_od = calc_days_overdue(subtask.due_date, now)
            project_name = None
            if subtask.task and subtask.task.project:
                project_name = subtask.task.project.name
            overdue.append({
                "id": subtask.id,
                "title": subtask.title,
                "days_overdue": days_od,
                "due_date": subtask.due_date.isoformat(),
                "status": subtask.status.value if hasattr(subtask.status, "value") else str(subtask.status),
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
                "project_name": project_name,
            })
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return overdue


def compute_overdue_projects(projects: list[Project], now: datetime) -> list[dict]:
    overdue = []
    for project in projects:
        status_val = project.status.value if hasattr(project.status, "value") else str(project.status)
        if status_val not in ("Done", "Archived", ProjectStatus.DONE, ProjectStatus.ARCHIVED) and is_overdue(project.due_date, now):
            days_od = calc_days_overdue(project.due_date, now)
            dept_names = [d.name for d in project.departments] if project.departments else []
            dept_str = ", ".join(dept_names) if dept_names else (project.lead.name if project.lead else None)
            overdue.append({
                "id": project.id,
                "title": project.name,
                "days_overdue": days_od,
                "due_date": project.due_date.isoformat(),
                "status": status_val,
                "department_name": dept_str,
                "departments": dept_names,
                "lead_name": project.lead.name if project.lead else None,
            })
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return overdue


async def get_employee_tasks(db: AsyncSession, current_user: User) -> list[Task]:
    # Get user's assigned tasks, plus tasks they lead
    task_result = await db.execute(
        select(Task)
        .options(selectinload(Task.project))
        .where(or_(Task.assigned_to == current_user.id, Task.lead_id == current_user.id))
    )
    return list(task_result.scalars().all())


async def get_employee_subtasks(db: AsyncSession, current_user: User) -> list[SubTask]:
    # Get user's assigned subtasks, plus subtasks under a task they lead
    subtask_result = await db.execute(
        select(SubTask)
        .options(selectinload(SubTask.task).selectinload(Task.project))
        .join(Task, Task.id == SubTask.task_id)
        .outerjoin(SubTaskAssignee, SubTaskAssignee.subtask_id == SubTask.id)
        .where(or_(SubTaskAssignee.user_id == current_user.id, Task.lead_id == current_user.id))
        .distinct()
    )
    return list(subtask_result.scalars().all())


async def get_manager_tasks(db: AsyncSession, current_user: User) -> list[Task]:
    task_query = select(Task).options(
        selectinload(Task.project).selectinload(Project.departments),
        selectinload(Task.creator),
        selectinload(Task.team_members),
    )
    result = await db.execute(task_query)
    all_tasks = result.scalars().all()
    return [task for task in all_tasks if can_view_task(current_user, task)]


async def get_manager_subtasks(db: AsyncSession, current_user: User) -> list[SubTask]:
    subtask_query = select(SubTask).options(
        selectinload(SubTask.task).selectinload(Task.project).selectinload(Project.departments),
        selectinload(SubTask.task).selectinload(Task.team_members),
        selectinload(SubTask.assignees),
    )
    result = await db.execute(subtask_query)
    all_subtasks = result.scalars().all()
    return [subtask for subtask in all_subtasks if can_view_subtask(current_user, subtask)]


async def get_manager_projects(db: AsyncSession, current_user: User) -> tuple[list[Project], bool]:
    scoped_dept_ids = get_scoped_department_ids(current_user)
    is_global = scoped_dept_ids is None
    project_query = select(Project).options(selectinload(Project.departments), selectinload(Project.lead))
    result = await db.execute(project_query)
    all_projects = result.scalars().all()
    scoped_projects = [
        project for project in all_projects
        if is_global or is_project_lead(current_user, project) or any(d.id in scoped_dept_ids for d in project.departments)
    ]
    return scoped_projects, is_global


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)

    if is_manager:
        return await get_manager_dashboard(db, current_user)
    else:
        return await get_employee_dashboard(db, current_user)


async def get_employee_dashboard(db: AsyncSession, current_user: User) -> dict:
    """Dashboard for regular employees - their own assigned tasks and subtasks."""
    tasks = await get_employee_tasks(db, current_user)
    subtasks = await get_employee_subtasks(db, current_user)
    
    # Group tasks by status - always include every status, even with 0 count
    task_status_counts = {s.value: 0 for s in TaskStatus}
    for task in tasks:
        task_status_counts[task.status.value] += 1
    
    # Group subtasks by status - always include every status, even with 0 count
    subtask_status_counts = {s.value: 0 for s in TaskStatus}
    for subtask in subtasks:
        subtask_status_counts[subtask.status.value] += 1
    
    # Get upcoming due items (tasks and subtasks not done, sorted by due_date)
    upcoming = []
    
    for task in tasks:
        if task.status != TaskStatus.DONE and task.due_date:
            upcoming.append({
                "type": "task",
                "id": task.id,
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value if hasattr(task.status, "value") else str(task.status),
                "project_id": task.project_id,
                "project_name": task.project.name if task.project else None,
            })
    
    for subtask in subtasks:
        if subtask.status != TaskStatus.DONE and subtask.due_date:
            upcoming.append({
                "type": "subtask",
                "id": subtask.id,
                "title": subtask.title,
                "due_date": subtask.due_date.isoformat(),
                "status": subtask.status.value if hasattr(subtask.status, "value") else str(subtask.status),
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
            })
    
    # Sort by due_date ascending
    upcoming.sort(key=lambda x: x["due_date"])
    # Return top 10
    upcoming = upcoming[:10]

    now = datetime.now(timezone.utc)
    overdue_tasks = compute_overdue_tasks(tasks, now)
    overdue_subtasks = compute_overdue_subtasks(subtasks, now)
    
    return {
        "user_type": "employee",
        "tasks": {
            "by_status": task_status_counts,
            "total": len(tasks),
        },
        "subtasks": {
            "by_status": subtask_status_counts,
            "total": len(subtasks),
        },
        "upcoming_due": upcoming,
        "overdue_tasks": overdue_tasks[:4],
        "overdue_tasks_total": len(overdue_tasks),
        "overdue_subtasks": overdue_subtasks[:4],
        "overdue_subtasks_total": len(overdue_subtasks),
    }


async def get_manager_dashboard(db: AsyncSession, current_user: User) -> dict:
    """Dashboard for project:manage holders - scoped to their department."""
    scoped_tasks = await get_manager_tasks(db, current_user)
    scoped_subtasks = await get_manager_subtasks(db, current_user)
    scoped_projects, is_global = await get_manager_projects(db, current_user)
    
    # Group tasks by status - always include every status, even with 0 count
    task_status_counts = {s.value: 0 for s in TaskStatus}
    for task in scoped_tasks:
        task_status_counts[task.status.value] += 1
    
    # Group subtasks by status - always include every status, even with 0 count
    subtask_status_counts = {s.value: 0 for s in TaskStatus}
    for subtask in scoped_subtasks:
        subtask_status_counts[subtask.status.value] += 1
    
    # Group projects by status - always include every status, even with 0 count
    project_status_counts = {s.value: 0 for s in ProjectStatus}
    for project in scoped_projects:
        project_status_counts[project.status.value] += 1
    
    # Get upcoming due items
    upcoming = []
    
    for task in scoped_tasks:
        if task.status != TaskStatus.DONE and task.due_date:
            upcoming.append({
                "type": "task",
                "id": task.id,
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value if hasattr(task.status, "value") else str(task.status),
                "project_id": task.project_id,
                "project_name": task.project.name if task.project else None,
            })
    
    for subtask in scoped_subtasks:
        if subtask.status != TaskStatus.DONE and subtask.due_date:
            upcoming.append({
                "type": "subtask",
                "id": subtask.id,
                "title": subtask.title,
                "due_date": subtask.due_date.isoformat(),
                "status": subtask.status.value if hasattr(subtask.status, "value") else str(subtask.status),
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
            })
    
    # Sort by due_date ascending
    upcoming.sort(key=lambda x: x["due_date"])
    # Return top 10
    upcoming = upcoming[:10]

    now = datetime.now(timezone.utc)
    overdue_tasks = compute_overdue_tasks(scoped_tasks, now)
    overdue_subtasks = compute_overdue_subtasks(scoped_subtasks, now)
    overdue_projects = compute_overdue_projects(scoped_projects, now)
    
    return {
        "user_type": "manager",
        "scope": "global" if is_global else "department",
        "tasks": {
            "by_status": task_status_counts,
            "total": len(scoped_tasks),
        },
        "subtasks": {
            "by_status": subtask_status_counts,
            "total": len(scoped_subtasks),
        },
        "projects": {
            "by_status": project_status_counts,
            "total": len(scoped_projects),
        },
        "upcoming_due": upcoming,
        "overdue_tasks": overdue_tasks[:4],
        "overdue_tasks_total": len(overdue_tasks),
        "overdue_subtasks": overdue_subtasks[:4],
        "overdue_subtasks_total": len(overdue_subtasks),
        "overdue_projects": overdue_projects[:4],
        "overdue_projects_total": len(overdue_projects),
    }


@router.get("/overdue/tasks")
async def get_overdue_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    if is_manager:
        tasks = await get_manager_tasks(db, current_user)
    else:
        tasks = await get_employee_tasks(db, current_user)
    
    now = datetime.now(timezone.utc)
    overdue_tasks = compute_overdue_tasks(tasks, now)
    return overdue_tasks[:200]


@router.get("/overdue/subtasks")
async def get_overdue_subtasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    if is_manager:
        subtasks = await get_manager_subtasks(db, current_user)
    else:
        subtasks = await get_employee_subtasks(db, current_user)
    
    now = datetime.now(timezone.utc)
    overdue_subtasks = compute_overdue_subtasks(subtasks, now)
    return overdue_subtasks[:200]


@router.get("/overdue/projects")
async def get_overdue_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    if not is_manager:
        raise HTTPException(status_code=403, detail="Manager permission required")
    
    projects, _ = await get_manager_projects(db, current_user)
    now = datetime.now(timezone.utc)
    overdue_projects = compute_overdue_projects(projects, now)
    return overdue_projects[:200]