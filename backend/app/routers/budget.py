"""
Budget tracking (Phase C).

  GET /projects/{id}/budget   approved budget (+ approved increases), split among tasks
  PUT /tasks/{id}/budget      give a task part of the project budget        {amount}
  GET /tasks/{id}/budget      the task's budget, split among its subtasks
  PUT /subtasks/{id}/budget   give a subtask part of its task's budget      {amount}
  GET /subtasks/{id}/budget

RULES
  - Only when the project's Budget approval is Approved.
  - Project budget = approved Budget amount + every approved Budget increase.
  - Tasks together can't get more than the project budget; subtasks together can't
    get more than their task's budget.
  - A task's budget can't go below what its subtasks already have.
  - Amount 0 removes the allocation.
  - Who sets task budgets: the project lead or a manager of the project.
    Who sets subtask budgets: also the task lead.
  - Every change is written to the project's Activity.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    can_create_subtask_in_task, can_edit_delete_task, can_view_project, can_view_subtask, can_view_task,
    get_current_user, has_permission, project_in_scope,
)
from app.database import get_db
from app.models.approval import BUDGET_KEY, ApprovalStatus, ApprovalType, ProjectApproval
from app.models.budget import BUDGET_INCREASE_KEY, SubtaskBudget, TaskBudget
from app.models.project import Project, ProjectTeam
from app.models.subtask import SubTask
from app.models.task import Task
from app.models.user import User
from app.schemas.approval import MAX_AMOUNT
from app.services.activity_log import log_activity

router = APIRouter(tags=["budget"])
ZERO = Decimal("0")


class AmountIn(BaseModel):
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def _ok(cls, v: Decimal) -> Decimal:
        if v < 0 or v > MAX_AMOUNT:
            raise ValueError("Amount must be 0 or more")
        if v.as_tuple().exponent < -2:
            raise ValueError("Use at most 2 decimal places")
        return v


def _f(v) -> float:
    return float(v or 0)


def _pkr(v) -> str:
    return f"PKR {Decimal(v or 0):,.2f}"


# --------------------------------------------------------------------------- loading
async def _project(db: AsyncSession, project_id: int, lock: bool = False) -> Project:
    q = select(Project).options(
        selectinload(Project.departments),
        selectinload(Project.team_members).selectinload(ProjectTeam.user),
        selectinload(Project.lead),
    ).where(Project.id == project_id)
    if lock:
        q = q.with_for_update(of=Project)
    p = (await db.execute(q)).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


async def _task(db: AsyncSession, task_id: int, lock: bool = False) -> Task:
    q = select(Task).options(
        selectinload(Task.project).selectinload(Project.departments),
        selectinload(Task.project).selectinload(Project.team_members),
        selectinload(Task.team_members),
        selectinload(Task.creator),
    ).where(Task.id == task_id)
    if lock:
        q = q.with_for_update(of=Task)
    t = (await db.execute(q)).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


async def _subtask(db: AsyncSession, subtask_id: int) -> SubTask:
    s = (await db.execute(select(SubTask).options(
        selectinload(SubTask.assignees),
        selectinload(SubTask.task).selectinload(Task.project).selectinload(Project.departments),
        selectinload(SubTask.task).selectinload(Task.project).selectinload(Project.team_members),
        selectinload(SubTask.task).selectinload(Task.team_members),
        selectinload(SubTask.task).selectinload(Task.creator),
    ).where(SubTask.id == subtask_id))).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    return s


async def _approval(db: AsyncSession, project_id: int, key: str) -> ProjectApproval | None:
    return (await db.execute(
        select(ProjectApproval).join(ApprovalType, ApprovalType.id == ProjectApproval.approval_type_id)
        .where(ProjectApproval.project_id == project_id, ApprovalType.key == key)
    )).scalar_one_or_none()


async def project_budget(db: AsyncSession, project_id: int) -> dict:
    """Budget figures for a project (no permission check)."""
    budget = await _approval(db, project_id, BUDGET_KEY)
    enabled = budget is not None and budget.status == ApprovalStatus.APPROVED.value
    increase = await _approval(db, project_id, BUDGET_INCREASE_KEY) if enabled else None
    initial = Decimal(budget.approved_amount or 0) if enabled else ZERO
    increases = [e for e in (increase.events if increase else []) if e.action == "approved" and e.amount is not None]
    total = initial + sum((Decimal(e.amount) for e in increases), ZERO)
    allocated = (await db.execute(
        select(func.coalesce(func.sum(TaskBudget.amount), 0)).join(Task, Task.id == TaskBudget.task_id).where(Task.project_id == project_id)
    )).scalar() or ZERO
    return {"budget": budget, "enabled": enabled, "increase": increase, "initial": initial, "increases": increases,
            "total": total, "allocated": Decimal(allocated)}


async def _task_amount(db: AsyncSession, task_id: int) -> Decimal | None:
    row = (await db.execute(select(TaskBudget.amount).where(TaskBudget.task_id == task_id))).scalar_one_or_none()
    return Decimal(row) if row is not None else None


async def _subtasks_allocated(db: AsyncSession, task_id: int) -> Decimal:
    v = (await db.execute(
        select(func.coalesce(func.sum(SubtaskBudget.amount), 0)).join(SubTask, SubTask.id == SubtaskBudget.subtask_id).where(SubTask.task_id == task_id)
    )).scalar()
    return Decimal(v or 0)


def _can_allocate_tasks(user: User, project: Project) -> bool:
    return project.lead_id == user.id or (has_permission(user, "project:manage") and project_in_scope(user, project))


# --------------------------------------------------------------------------- project
@router.get("/projects/{project_id}/budget")
async def get_project_budget(project_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    project = await _project(db, project_id)
    if not can_view_project(user, project):
        raise HTTPException(status_code=403, detail="You do not have permission to view this project")
    b = await project_budget(db, project_id)
    out = {
        "enabled": b["enabled"],
        "budget_status": b["budget"].status if b["budget"] else None,
        "initial": _f(b["initial"]), "total": _f(b["total"]), "allocated": _f(b["allocated"]),
        "remaining": _f(b["total"] - b["allocated"]),
        "increases": [{"amount": _f(e.amount), "at": e.created_at, "by": e.actor.name if e.actor else None, "comment": e.comment} for e in b["increases"]],
        "can_allocate": b["enabled"] and _can_allocate_tasks(user, project),
        "increase": None, "tasks": [],
    }
    if not b["enabled"]:
        return out

    # The Budget increase approval exists once the budget is approved
    increase = b["increase"]
    if increase is None:
        t = (await db.execute(select(ApprovalType).where(ApprovalType.key == BUDGET_INCREASE_KEY))).scalar_one_or_none()
        if t is not None:
            increase = ProjectApproval(project_id=project_id, approval_type_id=t.id, status=ApprovalStatus.NOT_REQUESTED.value)
            db.add(increase)
            await db.commit()
            await db.refresh(increase, ["approval_type", "events", "requester", "decider"])
    if increase is not None:
        from app.routers.approvals import _pa_out
        out["increase"] = (await _pa_out(db, increase, user, project)).model_dump(mode="json")

    tasks = (await db.execute(
        select(Task).options(selectinload(Task.project).selectinload(Project.departments), selectinload(Task.team_members))
        .where(Task.project_id == project_id).order_by(Task.id)
    )).scalars().all()
    amounts = dict((await db.execute(select(TaskBudget.task_id, TaskBudget.amount).where(TaskBudget.task_id.in_([t.id for t in tasks] or [0])))).all())
    sub_rows = (await db.execute(
        select(SubTask.task_id, func.count(SubTask.id), func.coalesce(func.sum(SubtaskBudget.amount), 0))
        .outerjoin(SubtaskBudget, SubtaskBudget.subtask_id == SubTask.id)
        .where(SubTask.task_id.in_([t.id for t in tasks] or [0])).group_by(SubTask.task_id)
    )).all()
    subs = {tid: (n, Decimal(s or 0)) for tid, n, s in sub_rows}
    for t in tasks:
        if not can_view_task(user, t):
            continue
        n, s = subs.get(t.id, (0, ZERO))
        out["tasks"].append({"id": t.id, "title": t.title, "status": t.status.value, "amount": _f(amounts.get(t.id)),
                             "subtask_count": n, "subtasks_allocated": _f(s)})
    return out


# --------------------------------------------------------------------------- task
@router.get("/tasks/{task_id}/budget")
async def get_task_budget(task_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    task = await _task(db, task_id)
    if not can_view_task(user, task):
        raise HTTPException(status_code=404, detail="Task not found")
    if task.project_id is None:
        return {"enabled": False}
    b = await project_budget(db, task.project_id)
    if not b["enabled"]:
        return {"enabled": False}
    amount = await _task_amount(db, task.id) or ZERO
    subs = (await db.execute(
        select(SubTask.id, SubTask.title, SubTask.status, SubtaskBudget.amount)
        .outerjoin(SubtaskBudget, SubtaskBudget.subtask_id == SubTask.id)
        .where(SubTask.task_id == task.id).order_by(SubTask.id)
    )).all()
    given = sum((Decimal(a or 0) for *_, a in subs), ZERO)
    return {
        "enabled": True, "amount": _f(amount), "allocated_to_subtasks": _f(given), "remaining": _f(amount - given),
        "subtasks": [{"id": i, "title": ti, "status": st.value, "amount": _f(a)} for i, ti, st, a in subs],
        "project_total": _f(b["total"]), "project_remaining": _f(b["total"] - b["allocated"]),
        "can_set_task": can_edit_delete_task(user, task),
        "can_allocate_subtasks": can_create_subtask_in_task(user, task),
    }


@router.put("/tasks/{task_id}/budget")
async def set_task_budget(task_id: int, payload: AmountIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    task = await _task(db, task_id)
    if task.project_id is None:
        raise HTTPException(status_code=400, detail="Only tasks in a project can have a budget")
    if not can_view_task(user, task):
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_edit_delete_task(user, task):
        raise HTTPException(status_code=403, detail="Only the project lead or a manager of this project can set task budgets")
    await _project(db, task.project_id, lock=True)  # one change at a time per project
    b = await project_budget(db, task.project_id)
    if not b["enabled"]:
        raise HTTPException(status_code=400, detail="The project budget has not been approved yet")
    old = await _task_amount(db, task.id) or ZERO
    new = payload.amount
    given = await _subtasks_allocated(db, task.id)
    if new < given:
        raise HTTPException(status_code=400, detail=f"Its subtasks already have {_pkr(given)}. The task budget cannot be less than that.")
    others = b["allocated"] - old
    if others + new > b["total"]:
        raise HTTPException(status_code=400, detail=f"Only {_pkr(b['total'] - others)} of the project budget is left for this task.")
    if new == 0:
        await db.execute(delete(TaskBudget).where(TaskBudget.task_id == task.id))
    else:
        row = await db.get(TaskBudget, task.id)
        if row is None:
            db.add(TaskBudget(task_id=task.id, amount=new, set_by=user.id))
        else:
            row.amount, row.set_by = new, user.id
    await log_activity(db, user.id, "budget_allocated", "project", task.project_id,
                       detail=f"Task '{task.title}': {_pkr(new)} (was {_pkr(old)})")
    await db.commit()
    return await get_task_budget(task_id, db, user)


# --------------------------------------------------------------------------- subtask
@router.get("/subtasks/{subtask_id}/budget")
async def get_subtask_budget(subtask_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sub = await _subtask(db, subtask_id)
    if not can_view_subtask(user, sub):
        raise HTTPException(status_code=404, detail="Subtask not found")
    task = sub.task
    if task.project_id is None or not (await project_budget(db, task.project_id))["enabled"]:
        return {"enabled": False}
    row = await db.get(SubtaskBudget, sub.id)
    task_amount = await _task_amount(db, task.id) or ZERO
    given = await _subtasks_allocated(db, task.id)
    return {"enabled": True, "amount": _f(row.amount if row else 0), "task_amount": _f(task_amount),
            "task_remaining": _f(task_amount - given), "can_set": can_create_subtask_in_task(user, task)}


@router.put("/subtasks/{subtask_id}/budget")
async def set_subtask_budget(subtask_id: int, payload: AmountIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sub = await _subtask(db, subtask_id)
    if not can_view_subtask(user, sub):
        raise HTTPException(status_code=404, detail="Subtask not found")
    task = sub.task
    if task.project_id is None:
        raise HTTPException(status_code=400, detail="Only tasks in a project can have a budget")
    if not can_create_subtask_in_task(user, task):
        raise HTTPException(status_code=403, detail="Only the task lead, the project lead or a manager of this project can set subtask budgets")
    await _task(db, task.id, lock=True)  # one change at a time per task
    if not (await project_budget(db, task.project_id))["enabled"]:
        raise HTTPException(status_code=400, detail="The project budget has not been approved yet")
    task_amount = await _task_amount(db, task.id) or ZERO
    row = await db.get(SubtaskBudget, sub.id)
    old = Decimal(row.amount) if row else ZERO
    others = await _subtasks_allocated(db, task.id) - old
    new = payload.amount
    if others + new > task_amount:
        left = task_amount - others
        raise HTTPException(status_code=400, detail=(f"Only {_pkr(left)} of the task budget is left for this subtask." if task_amount > 0
                                                     else "Give the task a budget first."))
    if new == 0:
        if row is not None:
            await db.delete(row)
    elif row is None:
        db.add(SubtaskBudget(subtask_id=sub.id, amount=new, set_by=user.id))
    else:
        row.amount, row.set_by = new, user.id
    await log_activity(db, user.id, "budget_allocated", "project", task.project_id,
                       detail=f"Subtask '{sub.title}' (task '{task.title}'): {_pkr(new)} (was {_pkr(old)})")
    await db.commit()
    return await get_subtask_budget(subtask_id, db, user)
