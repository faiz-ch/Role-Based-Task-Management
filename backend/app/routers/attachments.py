import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, has_permission, can_view_task, can_manage_project, is_project_lead
from app.database import get_db
from app.models.attachment import Attachment
from app.models.task import Task, TaskStatus
from app.models.subtask import SubTask
from app.models.project import Project
from app.models.user import User
from app.schemas.attachment import AttachmentOut
from app.services.conversion import convert_to_pdf

router = APIRouter(prefix="/attachments", tags=["attachments"])
UPLOAD_DIR = "uploads"  # relative to backend/ — where uploaded files actually live on disk


async def _get_task_or_404_with_loads(db: AsyncSession, task_id: int) -> Task:
    """Helper to load a task with necessary relationships."""
    from sqlalchemy.orm import selectinload
    task = await db.execute(
        select(Task).options(
            selectinload(Task.project).selectinload(Project.departments),
            selectinload(Task.team_members),
        ).where(Task.id == task_id)
    )
    task = task.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def _get_project_or_404_with_loads(db: AsyncSession, project_id: int) -> Project:
    """Helper to load a project with necessary relationships."""
    project = await db.execute(
        select(Project).options(
            selectinload(Project.departments),
            selectinload(Project.team_members),
        ).where(Project.id == project_id)
    )
    project = project.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _can_view_attachment(current_user: User, attachment: Attachment) -> bool:
    """Check if user can view an attachment based on whether it's task or project linked."""
    if attachment.task_id is not None:
        # Task attachment - use task view permission
        # We need to load the task to check permissions
        return True  # Will be checked in the endpoint with full task load
    elif attachment.project_id is not None:
        # Project attachment - use project view permission
        # We need to load the project to check permissions
        return True  # Will be checked in the endpoint with full project load
    else:
        # Attachment belongs to neither - deny access
        return False


# Task attachment endpoints
@router.post("/tasks/{task_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_task_attachment(
    task_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Saves the uploaded file to disk under uploads/tasks/{task_id}/, and creates a
    matching Attachment row pointing to it. Gated by the same task-visibility
    scope as everything else — if you can't see a task, you can't attach
    files to it either.
    """
    task = await _get_task_or_404_with_loads(db, task_id)

    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")

    task_dir = os.path.join(UPLOAD_DIR, "tasks", str(task_id))
    os.makedirs(task_dir, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{file.filename}"
    stored_path = os.path.join(task_dir, stored_name)

    content = await file.read()
    with open(stored_path, "wb") as f:
        f.write(content)

    attachment = Attachment(
        task_id=task_id,
        filename=file.filename,
        stored_path=stored_path,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


@router.get("/tasks/{task_id}/attachments", response_model=list[AttachmentOut])
async def list_task_attachments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task_or_404_with_loads(db, task_id)
    if not can_view_task(current_user, task):
        raise HTTPException(status_code=404, detail="Task not found")
    result = await db.execute(select(Attachment).where(Attachment.task_id == task_id))
    return result.scalars().all()


# Project attachment endpoints
@router.post("/projects/{project_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_project_attachment(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Saves the uploaded file to disk under uploads/projects/{project_id}/, and creates a
    matching Attachment row pointing to it. Anyone who can view the project can upload attachments.
    """
    project = await _get_project_or_404_with_loads(db, project_id)

    # Check access permissions (same as get_project)
    has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
    in_scope = False
    if has_view_perm:
        from app.core.deps import get_scoped_department_ids
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
            in_scope = True

    is_lead = is_project_lead(current_user, project)
    is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

    if not (in_scope or is_lead or is_team_member):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    project_dir = os.path.join(UPLOAD_DIR, "projects", str(project_id))
    os.makedirs(project_dir, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{file.filename}"
    stored_path = os.path.join(project_dir, stored_name)

    content = await file.read()
    with open(stored_path, "wb") as f:
        f.write(content)

    attachment = Attachment(
        project_id=project_id,
        filename=file.filename,
        stored_path=stored_path,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


@router.get("/projects/{project_id}/attachments", response_model=list[AttachmentOut])
async def list_project_attachments(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all attachments for a project. Anyone who can view the project can view its attachments."""
    project = await _get_project_or_404_with_loads(db, project_id)

    # Check access permissions (same as get_project)
    has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
    in_scope = False
    if has_view_perm:
        from app.core.deps import get_scoped_department_ids
        scoped_dept_ids = get_scoped_department_ids(current_user)
        if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
            in_scope = True

    is_lead = is_project_lead(current_user, project)
    is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

    if not (in_scope or is_lead or is_team_member):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")

    result = await db.execute(select(Attachment).where(Attachment.project_id == project_id))
    return result.scalars().all()


# Shared attachment endpoints (work for both task and project attachments)
@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Check permissions based on whether it's a task or project attachment
    if attachment.task_id is not None:
        task = await _get_task_or_404_with_loads(db, attachment.task_id)
        if not can_view_task(current_user, task):
            raise HTTPException(status_code=404, detail="Attachment not found")
    elif attachment.project_id is not None:
        project = await _get_project_or_404_with_loads(db, attachment.project_id)
        # Check access permissions
        has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
        in_scope = False
        if has_view_perm:
            from app.core.deps import get_scoped_department_ids
            scoped_dept_ids = get_scoped_department_ids(current_user)
            if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
                in_scope = True

        is_lead = is_project_lead(current_user, project)
        is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

        if not (in_scope or is_lead or is_team_member):
            raise HTTPException(status_code=404, detail="Attachment not found")
    else:
        # Attachment belongs to neither task nor project
        raise HTTPException(status_code=404, detail="Attachment not found")

    return FileResponse(
        attachment.stored_path,
        media_type=attachment.content_type,
        filename=attachment.filename,
    )


@router.delete("/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an attachment. Only the person who uploaded the attachment can delete it
    while the associated task/subtask is in an editable state (To Do or Reschedule).
    For project attachments, only the uploader can delete while the project is editable.
    After submission, only users with project:manage permission can delete attachments.
    """
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Check editable state based on whether this is a task, subtask, or project attachment
    is_editable = False
    if attachment.subtask_id is not None:
        # Subtask attachment - check subtask status
        subtask_result = await db.execute(select(SubTask).where(SubTask.id == attachment.subtask_id))
        subtask = subtask_result.scalar_one_or_none()
        if subtask is None:
            raise HTTPException(status_code=404, detail="Subtask not found")
        is_editable = subtask.status in ("To Do", "Reschedule")
    elif attachment.task_id is not None:
        # Task attachment - check task status
        task = await _get_task_or_404_with_loads(db, attachment.task_id)
        if not can_view_task(current_user, task):
            raise HTTPException(status_code=404, detail="Attachment not found")
        is_editable = task.status in (TaskStatus.TODO, TaskStatus.RESCHEDULE)
    elif attachment.project_id is not None:
        # Project attachment - check project status
        project = await _get_project_or_404_with_loads(db, attachment.project_id)
        # Check access permissions
        has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
        in_scope = False
        if has_view_perm:
            from app.core.deps import get_scoped_department_ids
            scoped_dept_ids = get_scoped_department_ids(current_user)
            if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
                in_scope = True

        is_lead = is_project_lead(current_user, project)
        is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

        if not (in_scope or is_lead or is_team_member):
            raise HTTPException(status_code=404, detail="Attachment not found")
        
        # Project is editable if it's in Planning or Active state
        from app.models.project import ProjectStatus
        is_editable = project.status in (ProjectStatus.PLANNING, ProjectStatus.ACTIVE)
    else:
        # Attachment belongs to neither task nor project
        raise HTTPException(status_code=404, detail="Attachment not found")

    # If in editable state, only the uploader can delete
    if is_editable:
        if current_user.id != attachment.uploaded_by:
            raise HTTPException(
                status_code=403,
                detail="Only the person who uploaded an attachment can delete it"
            )
    else:
        # If not in editable state, only project:manage users can delete
        if not has_permission(current_user, "project:manage"):
            raise HTTPException(
                status_code=403,
                detail="Only users with project:manage permission can delete attachments after submission"
            )

    # Delete file from disk if it exists
    if os.path.exists(attachment.stored_path):
        os.remove(attachment.stored_path)

    # Delete preview file if it exists
    if attachment.preview_path:
        try:
            if os.path.exists(attachment.preview_path):
                os.remove(attachment.preview_path)
        except Exception:
            pass  # Missing file shouldn't fail the request

    # Delete from database
    await db.delete(attachment)
    await db.commit()


@router.get("/{attachment_id}/preview")
async def preview_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Check permissions based on whether it's a task or project attachment
    if attachment.task_id is not None:
        task = await _get_task_or_404_with_loads(db, attachment.task_id)
        if not can_view_task(current_user, task):
            raise HTTPException(status_code=404, detail="Attachment not found")
        entity_id = attachment.task_id
        entity_type = "task"
    elif attachment.project_id is not None:
        project = await _get_project_or_404_with_loads(db, attachment.project_id)
        # Check access permissions
        has_view_perm = has_permission(current_user, "project:view") or has_permission(current_user, "project:manage")
        in_scope = False
        if has_view_perm:
            from app.core.deps import get_scoped_department_ids
            scoped_dept_ids = get_scoped_department_ids(current_user)
            if scoped_dept_ids is None or any(d.id in scoped_dept_ids for d in project.departments):
                in_scope = True

        is_lead = is_project_lead(current_user, project)
        is_team_member = any(tm.user_id == current_user.id for tm in project.team_members)

        if not (in_scope or is_lead or is_team_member):
            raise HTTPException(status_code=404, detail="Attachment not found")
        entity_id = attachment.project_id
        entity_type = "project"
    else:
        # Attachment belongs to neither task nor project
        raise HTTPException(status_code=404, detail="Attachment not found")

    if attachment.content_type == "application/pdf" or attachment.content_type.startswith("image/"):
        return FileResponse(attachment.stored_path, media_type=attachment.content_type)

    if attachment.preview_path and os.path.exists(attachment.preview_path):
        return FileResponse(attachment.preview_path, media_type="application/pdf")

    try:
        with open(attachment.stored_path, "rb") as f:
            original_bytes = f.read()
        pdf_bytes = await convert_to_pdf(original_bytes, attachment.filename)
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Preview not available for this file type. Try downloading it instead.",
        )

    preview_dir = os.path.join(UPLOAD_DIR, entity_type + "s", str(entity_id), "previews")
    os.makedirs(preview_dir, exist_ok=True)
    preview_path = os.path.join(preview_dir, f"{uuid.uuid4().hex}.pdf")
    with open(preview_path, "wb") as f:
        f.write(pdf_bytes)

    attachment.preview_path = preview_path
    await db.commit()

    return Response(content=pdf_bytes, media_type="application/pdf")
