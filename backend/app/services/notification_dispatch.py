"""
Decides WHO should get emailed for each task event, based on the Role
notification toggles (notify_on_assign/review/reschedule/done), then sends
those emails.

Each function here opens its OWN fresh database session instead of reusing
the request's session, since these run as FastAPI BackgroundTasks — AFTER
the API response has already been sent back to the frontend.
"""
from sqlalchemy import select, or_, exists, and_
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.task import Task
from app.models.user import User
from app.models.role import Role, role_department
from app.services.email import send_email
from app.services import email_templates


async def notify_task_assigned(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None or task.assignee is None:
            return
        # Send assignee their email unconditionally
        subject, body = email_templates.task_assigned_email(task)
        await send_email(task.assignee.email, subject, body)
        # Send supervisor broadcast to users with notify_on_assign flag
        supervisors = await _get_users_with_flag(db, task.department_id, "notify_on_assign", exclude_user_id=task.assignee.id)
        supervisor_subject, supervisor_body = email_templates.task_assigned_supervisor_email(task)
        for supervisor in supervisors:
            await send_email(supervisor.email, supervisor_subject, supervisor_body)


async def notify_task_submitted_for_review(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None:
            return
        reviewers = await _get_users_with_flag(db, task.department_id, "notify_on_review")
        subject, body = email_templates.task_submitted_for_review_email(task)
        for reviewer in reviewers:
            await send_email(reviewer.email, subject, body)


async def notify_task_rescheduled(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None or task.assignee is None:
            return
        # Send assignee their email unconditionally
        subject, body = email_templates.task_rescheduled_email(task)
        await send_email(task.assignee.email, subject, body)
        # Send supervisor broadcast to users with notify_on_reschedule flag
        supervisors = await _get_users_with_flag(db, task.department_id, "notify_on_reschedule", exclude_user_id=task.assignee.id)
        supervisor_subject, supervisor_body = email_templates.task_rescheduled_supervisor_email(task)
        for supervisor in supervisors:
            await send_email(supervisor.email, supervisor_subject, supervisor_body)


async def notify_task_done(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None or task.assignee is None:
            return
        # Send assignee their email unconditionally
        subject, body = email_templates.task_done_email(task)
        await send_email(task.assignee.email, subject, body)
        # Send supervisor broadcast to users with notify_on_done flag
        supervisors = await _get_users_with_flag(db, task.department_id, "notify_on_done", exclude_user_id=task.assignee.id)
        supervisor_subject, supervisor_body = email_templates.task_done_supervisor_email(task)
        for supervisor in supervisors:
            await send_email(supervisor.email, supervisor_subject, supervisor_body)


async def _load_task(db, task_id: int) -> Task | None:
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignee).selectinload(User.role),
            selectinload(Task.department)
        )
        .where(Task.id == task_id)
    )
    return result.scalar_one_or_none()


async def _get_users_with_flag(db, department_id: int | None, flag_name: str, exclude_user_id: int | None = None) -> list[User]:
    """Get all users whose role has the given notification flag enabled and whose
    department scope covers the given department. Optionally exclude a specific user.
    """
    department_match = (
        Role.all_departments == True
        if department_id is None
        else or_(
            Role.all_departments == True,
            exists().where(
                and_(
                    role_department.c.role_id == Role.id,
                    role_department.c.department_id == department_id,
                )
            ),
        )
    )
    query = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(getattr(Role, flag_name) == True)
        .where(department_match)
    )
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    result = await db.execute(query)
    return list(result.scalars().unique().all())