"""
Builds the subject + HTML body for each type of task notification email.
Kept separate from email.py (the "how do we send" mechanics) so the actual
wording/design of emails can be tweaked here without touching sending logic.
"""
from app.config import settings
from app.models.task import Task
from app.models.user import User


def _task_link(task: Task) -> str:
    return f"{settings.FRONTEND_URL}/tasks/{task.id}"


def _wrap(heading: str, body_line: str, task: Task) -> str:
    """Shared simple HTML layout so every email looks consistent."""
    return f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">{heading}</h2>
        <p style="color: #334155; font-size: 14px;">{body_line}</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{task.title}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Priority: {task.priority.value}</p>
        </div>
        <a href="{_task_link(task)}" style="display: inline-block; background: #3b82f6; color: white;
           padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">
            View Task
        </a>
    </div>
    """


def task_assigned_email(task: Task) -> tuple[str, str]:
    subject = f"Task assigned to you: {task.title}"
    body = _wrap("New task assigned", "A task has been assigned to you.", task)
    return subject, body


def task_submitted_for_review_email(task: Task) -> tuple[str, str]:
    subject = f"Task ready for review: {task.title}"
    body = _wrap("Task submitted for review", f"{task.assignee.name} submitted this task for your review.", task)
    return subject, body


def task_rescheduled_email(task: Task) -> tuple[str, str]:
    due = task.due_date.strftime("%b %d, %I:%M %p") if task.due_date else "no date set"
    subject = f"Task sent back for changes: {task.title}"
    body = _wrap("Task rescheduled", f"This task was sent back to you. New due date: {due}.", task)
    return subject, body


def task_done_email(task: Task) -> tuple[str, str]:
    subject = f"Task approved: {task.title}"
    body = _wrap("Task approved", "Your task was reviewed and approved.", task)
    return subject, body


def task_assigned_supervisor_email(task: Task) -> tuple[str, str]:
    subject = f"Task assigned: {task.title}"
    body = _wrap("Task assigned", f"{task.assignee.name} was assigned this task in {task.department.name if task.department else 'the system'}.", task)
    return subject, body


def task_rescheduled_supervisor_email(task: Task) -> tuple[str, str]:
    due = task.due_date.strftime("%b %d, %I:%M %p") if task.due_date else "no date set"
    subject = f"Task rescheduled: {task.title}"
    body = _wrap("Task rescheduled", f"{task.assignee.name}'s task was sent back for changes. New due date: {due}.", task)
    return subject, body


def task_done_supervisor_email(task: Task) -> tuple[str, str]:
    subject = f"Task approved: {task.title}"
    body = _wrap("Task approved", f"{task.assignee.name}'s task was reviewed and approved.", task)
    return subject, body