from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, has_permission, get_scoped_department_ids, can_view_task, can_view_subtask
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.project import Project
from app.models.user import User
from app.models.subtask import SubTask, SubTaskAssignee

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = has_permission(current_user, "project:manage")
    
    if is_manager:
        return await get_manager_dashboard(db, current_user)
    else:
        return await get_employee_dashboard(db, current_user)


async def get_employee_dashboard(db: AsyncSession, current_user: User) -> dict:
    """Dashboard for regular employees - their own assigned tasks and subtasks."""
    
    # Get user's assigned tasks
    task_result = await db.execute(
        select(Task)
        .options(selectinload(Task.project))
        .where(Task.assigned_to == current_user.id)
    )
    tasks = task_result.scalars().all()
    
    # Get user's assigned subtasks
    subtask_result = await db.execute(
        select(SubTask)
        .options(selectinload(SubTask.task).selectinload(Task.project))
        .join(SubTaskAssignee)
        .where(SubTaskAssignee.user_id == current_user.id)
    )
    subtasks = subtask_result.scalars().all()
    
    # Group tasks by status
    task_status_counts = {}
    for task in tasks:
        status = task.status.value
        task_status_counts[status] = task_status_counts.get(status, 0) + 1
    
    # Group subtasks by status
    subtask_status_counts = {}
    for subtask in subtasks:
        status = subtask.status.value
        subtask_status_counts[status] = subtask_status_counts.get(status, 0) + 1
    
    # Get upcoming due items (tasks and subtasks not done, sorted by due_date)
    upcoming = []
    
    for task in tasks:
        if task.status != TaskStatus.DONE and task.due_date:
            upcoming.append({
                "type": "task",
                "id": task.id,
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value,
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
                "status": subtask.status.value,
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
            })
    
    # Sort by due_date ascending
    upcoming.sort(key=lambda x: x["due_date"])
    # Return top 10
    upcoming = upcoming[:10]
    
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
    }


async def get_manager_dashboard(db: AsyncSession, current_user: User) -> dict:
    """Dashboard for project:manage holders - scoped to their department."""
    
    scoped_dept_ids = get_scoped_department_ids(current_user)
    is_global = scoped_dept_ids is None
    
    # Get all tasks within scope
    task_query = select(Task).options(
        selectinload(Task.project).selectinload(Project.departments),
        selectinload(Task.creator),
    )
    
    result = await db.execute(task_query)
    all_tasks = result.scalars().all()
    
    # Filter by scope
    scoped_tasks = []
    for task in all_tasks:
        if can_view_task(current_user, task):
            scoped_tasks.append(task)
    
    # Get all subtasks within scope (via parent task visibility)
    subtask_query = select(SubTask).options(
        selectinload(SubTask.task).selectinload(Task.project).selectinload(Project.departments),
    )
    
    result = await db.execute(subtask_query)
    all_subtasks = result.scalars().all()
    
    scoped_subtasks = []
    for subtask in all_subtasks:
        if can_view_subtask(current_user, subtask):
            scoped_subtasks.append(subtask)
    
    # Get projects within scope
    project_query = select(Project).options(selectinload(Project.departments))
    result = await db.execute(project_query)
    all_projects = result.scalars().all()
    
    scoped_projects = []
    for project in all_projects:
        if is_global or any(d.id in scoped_dept_ids for d in project.departments):
            scoped_projects.append(project)
    
    # Group tasks by status
    task_status_counts = {}
    for task in scoped_tasks:
        status = task.status.value
        task_status_counts[status] = task_status_counts.get(status, 0) + 1
    
    # Group subtasks by status
    subtask_status_counts = {}
    for subtask in scoped_subtasks:
        status = subtask.status.value
        subtask_status_counts[status] = subtask_status_counts.get(status, 0) + 1
    
    # Group projects by status
    project_status_counts = {}
    for project in scoped_projects:
        status = project.status
        project_status_counts[status] = project_status_counts.get(status, 0) + 1
    
    # Get upcoming due items
    upcoming = []
    
    for task in scoped_tasks:
        if task.status != TaskStatus.DONE and task.due_date:
            upcoming.append({
                "type": "task",
                "id": task.id,
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value,
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
                "status": subtask.status.value,
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
            })
    
    # Sort by due_date ascending
    upcoming.sort(key=lambda x: x["due_date"])
    # Return top 10
    upcoming = upcoming[:10]
    
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
    }