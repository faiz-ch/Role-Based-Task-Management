from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, has_permission, is_project_lead, can_manage_project
from app.database import get_db
from app.models.milestone import Milestone, MilestoneStatus
from app.models.project import Project
from app.models.user import User
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate, MilestoneOut
from app.services.activity_log import log_activity

router = APIRouter(prefix="/milestones", tags=["milestones"])


async def _get_project_or_404_with_loads(db: AsyncSession, project_id: int) -> Project:
    """Helper to load a project with necessary relationships."""
    project = await db.execute(
        select(Project)
        .options(selectinload(Project.departments))
        .where(Project.id == project_id)
    )
    project = project.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_milestone_or_404(db: AsyncSession, milestone_id: int) -> Milestone:
    """Helper to load a milestone with its project."""
    milestone = await db.execute(
        select(Milestone)
        .options(selectinload(Milestone.project).selectinload(Project.departments))
        .where(Milestone.id == milestone_id)
    )
    milestone = milestone.scalar_one_or_none()
    if milestone is None:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return milestone


def _can_view_project(current_user: User, project: Project) -> bool:
    """Check if user can view a project."""
    return can_manage_project(current_user, project)


def _can_edit_milestone(current_user: User, project: Project) -> bool:
    """Check if user can edit/create/delete milestones in a project."""
    return is_project_lead(current_user, project) or has_permission(current_user, "project:manage")


@router.get("/projects/{project_id}/milestones", response_model=list[MilestoneOut])
async def list_milestones(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all milestones for a project. Anyone with project view access can list."""
    project = await _get_project_or_404_with_loads(db, project_id)
    
    if not _can_view_project(current_user, project):
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = await db.execute(
        select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.due_date.asc())
    )
    milestones = result.scalars().all()
    return milestones


@router.post("/projects/{project_id}/milestones", response_model=MilestoneOut, status_code=201)
async def create_milestone(
    project_id: int,
    payload: MilestoneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a milestone for a project. Only project lead or users with project:manage permission can create."""
    project = await _get_project_or_404_with_loads(db, project_id)
    
    if not _can_edit_milestone(current_user, project):
        raise HTTPException(
            status_code=403,
            detail="Only the project lead or users with project:manage permission can create milestones"
        )
    
    milestone = Milestone(
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        status=payload.status,
        created_by=current_user.id,
    )
    db.add(milestone)
    await db.commit()
    await db.refresh(milestone)
    
    await log_activity(db, current_user.id, "milestone_created", "milestone", milestone.id, detail=payload.title)
    
    return milestone


@router.patch("/milestones/{id}", response_model=MilestoneOut)
async def update_milestone(
    milestone_id: int,
    payload: MilestoneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a milestone. Only project lead or users with project:manage permission can update."""
    milestone = await _get_milestone_or_404(db, milestone_id)
    
    if not _can_edit_milestone(current_user, milestone.project):
        raise HTTPException(
            status_code=403,
            detail="Only the project lead or users with project:manage permission can update milestones"
        )
    
    # Update fields if provided
    if payload.title is not None:
        milestone.title = payload.title
    if payload.description is not None:
        milestone.description = payload.description
    if payload.due_date is not None:
        milestone.due_date = payload.due_date
    if payload.status is not None:
        milestone.status = payload.status
    
    await db.commit()
    await db.refresh(milestone)
    
    await log_activity(db, current_user.id, "milestone_updated", "milestone", milestone.id, detail=milestone.title)
    
    return milestone


@router.delete("/milestones/{id}", status_code=204)
async def delete_milestone(
    milestone_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a milestone. Only project lead or users with project:manage permission can delete."""
    milestone = await _get_milestone_or_404(db, milestone_id)
    
    if not _can_edit_milestone(current_user, milestone.project):
        raise HTTPException(
            status_code=403,
            detail="Only the project lead or users with project:manage permission can delete milestones"
        )
    
    await log_activity(db, current_user.id, "milestone_deleted", "milestone", milestone_id, detail=milestone.title)
    
    await db.delete(milestone)
    await db.commit()
