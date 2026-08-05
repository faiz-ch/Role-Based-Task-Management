"""
Decides WHO should get emailed for each task/subtask/project/user event,
based on direct involvement (assignee, creator, team members) instead of
role-level broadcast flags.

Each function here opens its OWN fresh database session instead of reusing
the request's session, since these run as FastAPI BackgroundTasks — AFTER
the API response has already been sent back to the frontend.
"""
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.task import Task
from app.models.subtask import SubTask, SubTaskAssignee
from app.models.user import User
from app.models.role import Role
from app.models.category import Category
from app.models.project import Project, ProjectTeam
from app.services.email import send_email
from app.services import email_templates


# Task notifications (involvement-based)

async def notify_task_assigned(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None or task.assignee is None:
            return
        subject, body = email_templates.task_assigned_email(task)
        await send_email(task.assignee.email, subject, body)


async def notify_task_submitted_for_review(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None or task.creator is None:
            return
        subject, body = email_templates.task_submitted_for_review_email(task)
        await send_email(task.creator.email, subject, body)


async def notify_task_rescheduled(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None or task.assignee is None:
            return
        subject, body = email_templates.task_rescheduled_email(task)
        await send_email(task.assignee.email, subject, body)


async def notify_task_done(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await _load_task(db, task_id)
        if task is None:
            return
        subject, body = email_templates.task_done_email(task)
        # Email assignee
        if task.assignee:
            await send_email(task.assignee.email, subject, body)
        # Email creator
        if task.creator:
            await send_email(task.creator.email, subject, body)


# Subtask notifications (involvement-based)

async def notify_subtask_assigned(subtask_id: int) -> None:
    async with AsyncSessionLocal() as db:
        subtask = await _load_subtask(db, subtask_id)
        if subtask is None:
            return
        subject, body = email_templates.subtask_assigned_email(subtask)
        for assignee in subtask.assignees:
            await send_email(assignee.user.email, subject, body)


async def notify_subtask_submitted_for_review(subtask_id: int) -> None:
    async with AsyncSessionLocal() as db:
        subtask = await _load_subtask(db, subtask_id)
        if subtask is None or subtask.creator is None:
            return
        subject, body = email_templates.subtask_submitted_for_review_email(subtask)
        await send_email(subtask.creator.email, subject, body)


async def notify_subtask_rescheduled(subtask_id: int) -> None:
    async with AsyncSessionLocal() as db:
        subtask = await _load_subtask(db, subtask_id)
        if subtask is None:
            return
        subject, body = email_templates.subtask_rescheduled_email(subtask)
        for assignee in subtask.assignees:
            await send_email(assignee.user.email, subject, body)


async def notify_subtask_done(subtask_id: int) -> None:
    async with AsyncSessionLocal() as db:
        subtask = await _load_subtask(db, subtask_id)
        if subtask is None:
            return
        subject, body = email_templates.subtask_done_email(subtask)
        # Email assignees
        for assignee in subtask.assignees:
            await send_email(assignee.user.email, subject, body)
        # Email creator
        if subtask.creator:
            await send_email(subtask.creator.email, subject, body)


# Project notifications (involvement-based)

async def notify_project_team_assigned(project_id: int, lead_id: int, team_user_ids: list[int]) -> None:
    async with AsyncSessionLocal() as db:
        project = await _load_project(db, project_id)
        if project is None:
            return
        subject, body = email_templates.project_team_assigned_email(project)
        # Email the new lead
        if project.lead:
            await send_email(project.lead.email, subject, body)
        # Email all team members
        for team_member in project.team_members:
            await send_email(team_member.user.email, subject, body)


async def notify_project_completed(project_id: int) -> None:
    async with AsyncSessionLocal() as db:
        project = await _load_project(db, project_id)
        if project is None:
            return
        subject, body = email_templates.project_completed_email(project)
        
        # Email the project creator
        if project.creator:
            await send_email(project.creator.email, subject, body)
        
        # Email all users with Admin role
        result = await db.execute(
            select(User)
            .join(Role)
            .where(Role.name == "Admin")
        )
        admin_users = result.scalars().all()
        for admin in admin_users:
            await send_email(admin.email, subject, body)


async def notify_project_pending_approval(project_id: int) -> None:
    async with AsyncSessionLocal() as db:
        project = await _load_project(db, project_id)
        if project is None:
            return
        subject, body = email_templates.project_pending_approval_email(project)
        
        # Email every user whose role's category name is "Admin"
        result = await db.execute(
            select(User)
            .join(Role, User.role_id == Role.id)
            .join(Category, Role.category_id == Category.id)
            .where(Category.name == "Admin")
        )
        admin_users = result.scalars().all()
        for admin in admin_users:
            await send_email(admin.email, subject, body)


async def notify_project_rejected(project_id: int, reason: str) -> None:
    async with AsyncSessionLocal() as db:
        project = await _load_project(db, project_id)
        if project is None:
            return
        subject, body = email_templates.project_rejected_email(project, reason)
        
        # Email the project lead
        if project.lead:
            await send_email(project.lead.email, subject, body)


# User notifications

async def notify_user_created(user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            return
        subject, body = email_templates.user_created_email(user)
        await send_email(user.email, subject, body)


async def notify_user_name_changed(user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            return
        subject, body = email_templates.user_name_changed_email(user)
        await send_email(user.email, subject, body)


async def notify_user_email_changed(user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            return
        subject, body = email_templates.user_email_changed_email(user)
        await send_email(user.email, subject, body)


async def notify_user_password_changed(user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            return
        subject, body = email_templates.user_password_changed_email(user)
        await send_email(user.email, subject, body)


async def notify_user_deactivated(user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            return
        subject, body = email_templates.user_deactivated_email(user)
        await send_email(user.email, subject, body)


# Helper functions

async def _load_task(db, task_id: int) -> Task | None:
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.creator),
        )
        .where(Task.id == task_id)
    )
    return result.scalar_one_or_none()


async def _load_subtask(db, subtask_id: int) -> SubTask | None:
    result = await db.execute(
        select(SubTask)
        .options(
            selectinload(SubTask.assignees).selectinload(SubTaskAssignee.user),
            selectinload(SubTask.creator),
        )
        .where(SubTask.id == subtask_id)
    )
    return result.scalar_one_or_none()


async def _load_project(db, project_id: int) -> Project | None:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.lead),
            selectinload(Project.creator),
            selectinload(Project.team_members).selectinload(ProjectTeam.user),
        )
        .where(Project.id == project_id)
    )
    return result.scalar_one_or_none()
