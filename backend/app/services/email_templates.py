"""
Builds the subject + HTML body for each type of notification email.
Kept separate from email.py (the "how do we send" mechanics) so the actual
wording/design of emails can be tweaked here without touching sending logic.
"""
from app.config import settings
from app.models.task import Task
from app.models.subtask import SubTask
from app.models.project import Project
from app.models.user import User


def _task_link(task: Task) -> str:
    return f"{settings.FRONTEND_URL}/tasks/{task.id}"


def _subtask_link(subtask: SubTask) -> str:
    return f"{settings.FRONTEND_URL}/subtasks/{subtask.id}"


def _project_link(project: Project) -> str:
    return f"{settings.FRONTEND_URL}/projects/{project.id}"


def _login_link() -> str:
    return f"{settings.FRONTEND_URL}/login"


def _wrap(heading: str, body_line: str, entity_name: str, entity_link: str, detail_lines: list[str] | None = None) -> str:
    """Shared simple HTML layout so every email looks consistent."""
    details_html = ""
    if detail_lines:
        details_html = "\n".join(f"<p style='margin: 4px 0 0; font-size: 13px; color: #64748b;'>{line}</p>" for line in detail_lines)
    return f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">{heading}</h2>
        <p style="color: #334155; font-size: 14px;">{body_line}</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{entity_name}</p>
            {details_html}
        </div>
        <a href="{entity_link}" style="display: inline-block; background: #3b82f6; color: white;
           padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">
            View
        </a>
    </div>
    """


# Task email templates

def task_assigned_email(task: Task) -> tuple[str, str]:
    subject = f"Task assigned to you: {task.title}"
    body = _wrap("New task assigned", "A task has been assigned to you.", task.title, _task_link(task), [f"Priority: {task.priority.value}"])
    return subject, body


def task_submitted_for_review_email(task: Task) -> tuple[str, str]:
    assignee_name = task.assignee.name if task.assignee else "Someone"
    subject = f"Task ready for review: {task.title}"
    body = _wrap("Task submitted for review", f"{assignee_name} submitted this task for your review.", task.title, _task_link(task), [f"Priority: {task.priority.value}"])
    return subject, body


def task_rescheduled_email(task: Task) -> tuple[str, str]:
    due = task.due_date.strftime("%b %d, %I:%M %p") if task.due_date else "no date set"
    subject = f"Task sent back for changes: {task.title}"
    body = _wrap("Task rescheduled", f"This task was sent back to you. New due date: {due}.", task.title, _task_link(task), [f"Priority: {task.priority.value}"])
    return subject, body


def task_done_email(task: Task) -> tuple[str, str]:
    subject = f"Task approved: {task.title}"
    body = _wrap("Task approved", "Your task was reviewed and approved.", task.title, _task_link(task), [f"Priority: {task.priority.value}"])
    return subject, body


# Subtask email templates

def subtask_assigned_email(subtask: SubTask) -> tuple[str, str]:
    subject = f"Subtask assigned to you: {subtask.title}"
    body = _wrap("New subtask assigned", "A subtask has been assigned to you.", subtask.title, _subtask_link(subtask), [f"Priority: {subtask.priority}"])
    return subject, body


def subtask_submitted_for_review_email(subtask: SubTask) -> tuple[str, str]:
    assignee_names = ", ".join([a.name for a in subtask.assignees]) if subtask.assignees else "Someone"
    subject = f"Subtask ready for review: {subtask.title}"
    body = _wrap("Subtask submitted for review", f"{assignee_names} submitted this subtask for your review.", subtask.title, _subtask_link(subtask), [f"Priority: {subtask.priority}"])
    return subject, body


def subtask_rescheduled_email(subtask: SubTask) -> tuple[str, str]:
    due = subtask.due_date.strftime("%b %d, %I:%M %p") if subtask.due_date else "no date set"
    subject = f"Subtask sent back for changes: {subtask.title}"
    body = _wrap("Subtask rescheduled", f"This subtask was sent back to you. New due date: {due}.", subtask.title, _subtask_link(subtask), [f"Priority: {subtask.priority}"])
    return subject, body


def subtask_done_email(subtask: SubTask) -> tuple[str, str]:
    subject = f"Subtask approved: {subtask.title}"
    body = _wrap("Subtask approved", "Your subtask was reviewed and approved.", subtask.title, _subtask_link(subtask), [f"Priority: {subtask.priority}"])
    return subject, body


# Project email templates

def project_team_assigned_email(project: Project) -> tuple[str, str]:
    subject = f"Project team assigned: {project.name}"
    body = _wrap("Project team assigned", "You have been assigned to a project team.", project.name, _project_link(project), [f"Priority: {project.priority}"])
    return subject, body


def project_completed_email(project: Project) -> tuple[str, str]:
    subject = f"Project completed: {project.name}"
    body = _wrap("Project completed", "This project has been marked as complete.", project.name, _project_link(project), [f"Priority: {project.priority}"])
    return subject, body


def project_pending_approval_email(project: Project) -> tuple[str, str]:
    subject = f"Project pending approval: {project.name}"
    body = _wrap("Project pending approval", "A project has been submitted and is awaiting your approval.", project.name, _project_link(project), [f"Priority: {project.priority}"])
    return subject, body


def project_rejected_email(project: Project, reason: str) -> tuple[str, str]:
    subject = f"Project rejected: {project.name}"
    body = _wrap("Project rejected", "Your project submission was rejected and needs revision.", project.name, _project_link(project), [f"Reason: {reason}"])
    return subject, body


# User email templates

def user_created_email(user: User) -> tuple[str, str]:
    subject = "Welcome to the Task Management System"
    body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Welcome to the Task Management System</h2>
        <p style="color: #334155; font-size: 14px;">
            Your account has been created successfully. You can now log in to the system.
        </p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{user.name}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">{user.email}</p>
        </div>
        <a href="{_login_link()}" style="display: inline-block; background: #3b82f6; color: white;
           padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">
            Log In
        </a>
    </div>
    """
    return subject, body


def user_name_changed_email(user: User) -> tuple[str, str]:
    subject = "Your account name has been updated"
    body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Account Name Updated</h2>
        <p style="color: #334155; font-size: 14px;">
            Your account name has been changed successfully.
        </p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{user.name}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">{user.email}</p>
        </div>
        <a href="{_login_link()}" style="display: inline-block; background: #3b82f6; color: white;
           padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">
            Log In
        </a>
    </div>
    """
    return subject, body


def user_email_changed_email(user: User) -> tuple[str, str]:
    subject = "Your account email has been updated"
    body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Account Email Updated</h2>
        <p style="color: #334155; font-size: 14px;">
            Your account email has been changed successfully. This email address is now attached to your account.
        </p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{user.name}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">{user.email}</p>
        </div>
        <a href="{_login_link()}" style="display: inline-block; background: #3b82f6; color: white;
           padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">
            Log In
        </a>
    </div>
    """
    return subject, body


def user_password_changed_email(user: User) -> tuple[str, str]:
    subject = "Your password has been changed"
    body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Password Changed</h2>
        <p style="color: #334155; font-size: 14px;">
            Your account password has been changed successfully. If you did not make this change, please contact your administrator.
        </p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{user.name}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">{user.email}</p>
        </div>
        <a href="{_login_link()}" style="display: inline-block; background: #3b82f6; color: white;
           padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">
            Log In
        </a>
    </div>
    """
    return subject, body


def user_deactivated_email(user: User) -> tuple[str, str]:
    subject = "Your account has been deactivated"
    body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Account Deactivated</h2>
        <p style="color: #334155; font-size: 14px;">
            Your account has been deactivated. You will no longer be able to log in to the system. If you believe this is an error, please contact your administrator.
        </p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 600; color: #0f172a;">{user.name}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">{user.email}</p>
        </div>
    </div>
    """
    return subject, body
