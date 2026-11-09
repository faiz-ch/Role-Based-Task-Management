"""
Approvals (Phase B).

Approval types (Roles & Approvals page, needs "role:manage"):
  GET    /approval-types                  list (everyone signed in: the project form needs it)
  GET    /approval-types/approver-options roles with their members + all active people
  POST   /approval-types                  create
  PATCH  /approval-types/{id}             edit
  DELETE /approval-types/{id}             delete (only if no project uses it; never the built-in Budget)

Approvals on a project:
  GET  /projects/{id}/approvals           what the project needs + status + history
  PUT  /projects/{id}/approvals           choose the approvals the project needs
  POST /project-approvals/{id}/request    ask for approval (form: amount, reason, file)
  POST /project-approvals/{id}/decide     approve / reject / send back
  GET  /project-approvals/{id}/attachment the file sent with the request

Inbox:
  GET /approvals/me                       am I an approver, how many are waiting
  GET /approvals/inbox?status=pending|decided

RULES
  - Who approves: every active member of the type's roles, plus the named people.
  - Nobody decides a request they made.
  - If nobody else can decide it, it goes to the main Admin. The Admin cannot decide
    otherwise (unless listed as an approver), so "only the CFO" really means only the CFO.
  - Approvers see the requests sent to them even if the project is outside what they manage.
  - Mandatory types are added to every new project and cannot be removed from it.
  - An approval that was requested or decided cannot be removed from a project.
  - History is never deleted.
"""
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    can_view_project, get_current_user, has_permission, is_admin, project_in_scope, require_permission,
)
from app.database import AsyncSessionLocal, get_db
from app.models.approval import (
    BUDGET_KEY, ApprovalEvent, ApprovalStatus, ApprovalType, ProjectApproval, approval_type_role, approval_type_user,
)
from app.models.project import Project, ProjectTeam
from app.models.role import Role
from app.models.user import User
from app.schemas.approval import (
    MAX_AMOUNT, ApprovalEventOut, ApprovalsMe, ApprovalTypeIn, ApprovalTypeOut, ApprovalTypeUpdate, ApproverOptions,
    DecisionIn, PersonRef, ProjectApprovalOut, ProjectApprovalsSet, RoleRef,
)
from app.services.activity_log import log_activity
from app.services.email import send_email
from app.services import email_templates

router = APIRouter(tags=["approvals"])
MANAGE = "role:manage"
UPLOAD_DIR = os.path.join("uploads", "approvals")
MAX_FILE = 15 * 1024 * 1024
OPEN = {ApprovalStatus.NOT_REQUESTED.value, ApprovalStatus.REJECTED.value, ApprovalStatus.SENT_BACK.value}


# --------------------------------------------------------------------------- helpers
def _person(u: User | None) -> PersonRef | None:
    return PersonRef(id=u.id, name=u.name, email=u.email) if u else None


def _money(v) -> float | None:
    return float(v) if v is not None else None


def _type_out(t: ApprovalType, in_use: int = 0) -> ApprovalTypeOut:
    return ApprovalTypeOut(
        id=t.id, key=t.key, name=t.name, description=t.description, is_builtin=t.is_builtin,
        requires_amount=t.requires_amount, requires_attachment=t.requires_attachment, mandatory=t.mandatory,
        is_active=t.is_active,
        roles=[RoleRef(id=r.id, name=r.name) for r in sorted(t.roles, key=lambda r: r.name)],
        users=[PersonRef(id=u.id, name=u.name, email=u.email) for u in sorted(t.users, key=lambda u: u.name)],
        in_use=in_use,
    )


async def ensure_builtin_types() -> None:
    """Startup: make sure the built-in Budget type exists."""
    async with AsyncSessionLocal() as db:
        found = (await db.execute(select(ApprovalType).where(ApprovalType.key == BUDGET_KEY))).scalar_one_or_none()
        if found is None:
            name = "Budget"
            if (await db.execute(select(ApprovalType.id).where(func.lower(ApprovalType.name) == "budget"))).first():
                name = "Budget (built-in)"
            db.add(ApprovalType(key=BUDGET_KEY, name=name, requires_amount=True,
                                description="Money for the project. Once approved, the project budget can be split among tasks."))
            await db.commit()


async def _get_type(db: AsyncSession, type_id: int) -> ApprovalType:
    t = (await db.execute(select(ApprovalType).where(ApprovalType.id == type_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Approval type not found")
    return t


async def _usage(db: AsyncSession) -> dict[int, int]:
    rows = await db.execute(select(ProjectApproval.approval_type_id, func.count()).group_by(ProjectApproval.approval_type_id))
    return dict(rows.all())


async def _eligible_approvers(db: AsyncSession, t: ApprovalType) -> list[User]:
    """Active people who may decide this type (roles' members + named people)."""
    role_ids = [r.id for r in t.roles]
    user_ids = [u.id for u in t.users]
    if not role_ids and not user_ids:
        return []
    conds = []
    if role_ids:
        conds.append(User.role_id.in_(role_ids))
    if user_ids:
        conds.append(User.id.in_(user_ids))
    rows = await db.execute(select(User).where(User.is_active.is_(True), or_(*conds)).order_by(User.name))
    return list(rows.scalars().all())


async def _admins(db: AsyncSession) -> list[User]:
    rows = await db.execute(
        select(User).join(Role, User.role_id == Role.id).where(Role.is_system.is_(True), User.is_active.is_(True))
    )
    return list(rows.scalars().all())


async def _deciders(db: AsyncSession, pa: ProjectApproval) -> tuple[list[User], bool]:
    """Who may decide this request now: the approvers minus the requester, else the Admin."""
    people = [u for u in await _eligible_approvers(db, pa.approval_type) if u.id != pa.requested_by]
    if people:
        return people, False
    return [u for u in await _admins(db) if u.id != pa.requested_by], True


async def _load_project(db: AsyncSession, project_id: int) -> Project:
    p = (await db.execute(
        select(Project).options(
            selectinload(Project.departments),
            selectinload(Project.team_members).selectinload(ProjectTeam.user),
            selectinload(Project.lead),
        ).where(Project.id == project_id)
    )).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _can_edit_project(user: User, project: Project) -> bool:
    return has_permission(user, "project:manage") and project_in_scope(user, project)


def _can_request(user: User, project: Project) -> bool:
    return project.lead_id == user.id or _can_edit_project(user, project)


async def _load_pa(db: AsyncSession, pa_id: int) -> ProjectApproval:
    pa = (await db.execute(select(ProjectApproval).where(ProjectApproval.id == pa_id))).scalar_one_or_none()
    if pa is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    return pa


async def _pa_out(db: AsyncSession, pa: ProjectApproval, user: User, project: Project | None = None,
                  project_name: str | None = None) -> ProjectApprovalOut:
    deciders, fallback = await _deciders(db, pa) if pa.status == ApprovalStatus.PENDING.value else ([], False)
    if pa.status != ApprovalStatus.PENDING.value:
        deciders = [u for u in await _eligible_approvers(db, pa.approval_type)]
        fallback = not deciders
    can_decide = pa.status == ApprovalStatus.PENDING.value and user.id != pa.requested_by and any(u.id == user.id for u in deciders)
    can_request = bool(project) and pa.status in OPEN and pa.approval_type.is_active and _can_request(user, project)
    return ProjectApprovalOut(
        id=pa.id, project_id=pa.project_id, project_name=project_name or (project.name if project else None),
        type=_type_out(pa.approval_type), status=pa.status,
        amount=_money(pa.amount), approved_amount=_money(pa.approved_amount), reason=pa.reason,
        attachment_name=pa.attachment_name,
        requested_by=_person(pa.requester), requested_at=pa.requested_at,
        decided_by=_person(pa.decider), decided_at=pa.decided_at, decision_comment=pa.decision_comment,
        events=[ApprovalEventOut(id=e.id, action=e.action, actor=_person(e.actor), amount=_money(e.amount), comment=e.comment,
                                 attachment_name=e.attachment_name, created_at=e.created_at) for e in pa.events],
        can_request=can_request, can_decide=can_decide,
        approvers=[_person(u) for u in deciders], approver_is_admin_fallback=fallback,
    )


async def _check_people(db: AsyncSession, role_ids: list[int], user_ids: list[int]) -> None:
    if role_ids:
        found = set((await db.execute(select(Role.id).where(Role.id.in_(role_ids)))).scalars().all())
        if found != set(role_ids):
            raise HTTPException(status_code=400, detail="One of the chosen roles does not exist")
    if user_ids:
        found = set((await db.execute(select(User.id).where(User.id.in_(user_ids), User.is_active.is_(True)))).scalars().all())
        if found != set(user_ids):
            raise HTTPException(status_code=400, detail="One of the chosen people does not exist or is inactive")


async def _write_people(db: AsyncSession, type_id: int, role_ids: list[int] | None, user_ids: list[int] | None) -> None:
    if role_ids is not None:
        await db.execute(delete(approval_type_role).where(approval_type_role.c.approval_type_id == type_id))
        if role_ids:
            await db.execute(insert(approval_type_role), [{"approval_type_id": type_id, "role_id": r} for r in sorted(set(role_ids))])
    if user_ids is not None:
        await db.execute(delete(approval_type_user).where(approval_type_user.c.approval_type_id == type_id))
        if user_ids:
            await db.execute(insert(approval_type_user), [{"approval_type_id": type_id, "user_id": u} for u in sorted(set(user_ids))])


async def _name_taken(db: AsyncSession, name: str, exclude: int | None) -> bool:
    q = select(ApprovalType.id).where(func.lower(ApprovalType.name) == name.lower())
    if exclude is not None:
        q = q.where(ApprovalType.id != exclude)
    return (await db.execute(q)).first() is not None


# --------------------------------------------------------------------------- approval types
@router.get("/approval-types", response_model=list[ApprovalTypeOut])
async def list_types(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    types = (await db.execute(select(ApprovalType).order_by(ApprovalType.key.is_(None), ApprovalType.name))).scalars().all()
    usage = await _usage(db)
    if not has_permission(user, MANAGE):
        types = [t for t in types if t.is_active]
    return [_type_out(t, usage.get(t.id, 0)) for t in types]


@router.get("/approval-types/approver-options", response_model=ApproverOptions)
async def approver_options(db: AsyncSession = Depends(get_db), _: User = Depends(require_permission(MANAGE))):
    roles = (await db.execute(select(Role).order_by(Role.name))).scalars().all()
    people = (await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.name))).scalars().all()
    role_name = {r.id: r.name for r in roles}
    by_role: dict[int, list[dict]] = {}
    for u in people:
        if u.role_id is not None:
            by_role.setdefault(u.role_id, []).append({"id": u.id, "name": u.name, "email": u.email})
    return ApproverOptions(
        roles=[{"id": r.id, "name": r.name, "members": by_role.get(r.id, [])} for r in roles],
        users=[{"id": u.id, "name": u.name, "email": u.email, "role": role_name.get(u.role_id)} for u in people],
    )


@router.post("/approval-types", response_model=ApprovalTypeOut, status_code=201)
async def create_type(payload: ApprovalTypeIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    if await _name_taken(db, payload.name, None):
        raise HTTPException(status_code=400, detail=f"An approval type called '{payload.name}' already exists")
    await _check_people(db, payload.role_ids, payload.user_ids)
    t = ApprovalType(name=payload.name, description=payload.description, requires_amount=payload.requires_amount,
                     requires_attachment=payload.requires_attachment, mandatory=payload.mandatory,
                     is_active=payload.is_active, created_by=user.id)
    db.add(t)
    await db.flush()
    await _write_people(db, t.id, payload.role_ids, payload.user_ids)
    await log_activity(db, user.id, "approval_type_created", "approval_type", t.id, detail=payload.name)
    await db.commit()
    await db.refresh(t, ["roles", "users"])
    return _type_out(t)


@router.patch("/approval-types/{type_id}", response_model=ApprovalTypeOut)
async def update_type(type_id: int, payload: ApprovalTypeUpdate, db: AsyncSession = Depends(get_db),
                      user: User = Depends(require_permission(MANAGE))):
    t = await _get_type(db, type_id)
    if payload.name is not None and payload.name != t.name:
        if await _name_taken(db, payload.name, t.id):
            raise HTTPException(status_code=400, detail=f"An approval type called '{payload.name}' already exists")
        t.name = payload.name
    if payload.description is not None:
        t.description = payload.description.strip() or None
    if t.is_builtin:
        # Budget always carries an amount and cannot be switched off
        if payload.requires_amount is False or payload.is_active is False:
            raise HTTPException(status_code=400, detail="The built-in Budget approval always has an amount and stays active")
    else:
        if payload.requires_amount is not None:
            t.requires_amount = payload.requires_amount
        if payload.is_active is not None:
            t.is_active = payload.is_active
    if payload.requires_attachment is not None:
        t.requires_attachment = payload.requires_attachment
    if payload.mandatory is not None:
        t.mandatory = payload.mandatory
    await _check_people(db, payload.role_ids or [], payload.user_ids or [])
    await _write_people(db, t.id, payload.role_ids, payload.user_ids)
    await log_activity(db, user.id, "approval_type_updated", "approval_type", t.id, detail=t.name)
    await db.commit()
    await db.refresh(t, ["roles", "users"])
    return _type_out(t, (await _usage(db)).get(t.id, 0))


@router.delete("/approval-types/{type_id}", status_code=204)
async def delete_type(type_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    t = await _get_type(db, type_id)
    if t.is_builtin:
        raise HTTPException(status_code=400, detail="The built-in Budget approval cannot be deleted")
    used = (await _usage(db)).get(t.id, 0)
    if used:
        raise HTTPException(status_code=400, detail=f"{used} project(s) use '{t.name}'. Make it inactive instead, so its history is kept.")
    name = t.name
    await db.delete(t)
    await log_activity(db, user.id, "approval_type_deleted", "approval_type", type_id, detail=name)
    await db.commit()


# --------------------------------------------------------------------------- approvals on a project
async def validate_type_ids(db: AsyncSession, type_ids: list[int]) -> None:
    """Check chosen approval types before a project is created."""
    if not type_ids:
        return
    rows = (await db.execute(select(ApprovalType).where(ApprovalType.id.in_(set(type_ids))))).scalars().all()
    if len(rows) != len(set(type_ids)):
        raise HTTPException(status_code=400, detail="One of the chosen approvals does not exist")
    for t in rows:
        if not t.is_active:
            raise HTTPException(status_code=400, detail=f"'{t.name}' is inactive and cannot be added")


async def set_project_approvals(db: AsyncSession, project_id: int, type_ids: list[int] | None, actor: User,
                                creating: bool = False) -> None:
    """Make the project's approvals match `type_ids` (+ every mandatory type).
    Called by project create / update and by PUT /projects/{id}/approvals. Does not commit."""
    types = {t.id: t for t in (await db.execute(select(ApprovalType))).scalars().all()}
    wanted = set(type_ids or [])
    unknown = wanted - set(types)
    if unknown:
        raise HTTPException(status_code=400, detail="One of the chosen approvals does not exist")
    existing = {pa.approval_type_id: pa for pa in (await db.execute(
        select(ProjectApproval).where(ProjectApproval.project_id == project_id))).scalars().all()}
    inactive_new = [types[i].name for i in wanted if not types[i].is_active and i not in existing]
    if inactive_new:
        raise HTTPException(status_code=400, detail=f"'{inactive_new[0]}' is inactive and cannot be added")
    if creating:
        wanted |= {t.id for t in types.values() if t.mandatory and t.is_active}
    else:
        missing_mandatory = [types[i].name for i, pa in existing.items() if types[i].mandatory and i not in wanted]
        if missing_mandatory:
            raise HTTPException(status_code=400, detail=f"'{missing_mandatory[0]}' is required for every project and cannot be removed")
    for tid, pa in existing.items():
        if tid not in wanted:
            if pa.status != ApprovalStatus.NOT_REQUESTED.value:
                raise HTTPException(status_code=400, detail=f"'{types[tid].name}' has already been requested, so it cannot be removed")
            await db.delete(pa)
            await log_activity(db, actor.id, "approval_removed", "project", project_id, detail=types[tid].name)
    for tid in wanted - set(existing):
        db.add(ProjectApproval(project_id=project_id, approval_type_id=tid, status=ApprovalStatus.NOT_REQUESTED.value))
        await log_activity(db, actor.id, "approval_added", "project", project_id, detail=types[tid].name)


@router.get("/projects/{project_id}/approvals", response_model=list[ProjectApprovalOut])
async def project_approvals(project_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    project = await _load_project(db, project_id)
    rows = (await db.execute(
        select(ProjectApproval).where(ProjectApproval.project_id == project_id).order_by(ProjectApproval.id)
    )).scalars().all()
    if not can_view_project(user, project):
        # approvers may open the requests sent to them
        mine = []
        for pa in rows:
            deciders, _ = await _deciders(db, pa)
            if pa.status == ApprovalStatus.PENDING.value and any(u.id == user.id for u in deciders):
                mine.append(pa)
        if not mine:
            raise HTTPException(status_code=403, detail="You do not have permission to view this project")
        rows = mine
    return [await _pa_out(db, pa, user, project) for pa in rows]


@router.put("/projects/{project_id}/approvals", response_model=list[ProjectApprovalOut])
async def set_approvals(project_id: int, payload: ProjectApprovalsSet, db: AsyncSession = Depends(get_db),
                        user: User = Depends(require_permission("project:manage"))):
    project = await _load_project(db, project_id)
    if not project_in_scope(user, project):
        raise HTTPException(status_code=403, detail="This project is outside what you manage")
    await set_project_approvals(db, project_id, payload.approval_type_ids, user)
    await db.commit()
    return await project_approvals(project_id, db, user)


def _parse_amount(raw: str | None) -> Decimal | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        v = Decimal(str(raw).replace(",", "").strip())
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Amount must be a number")
    if v <= 0 or v > MAX_AMOUNT:
        raise HTTPException(status_code=400, detail="Amount must be more than 0")
    if v.as_tuple().exponent < -2:
        raise HTTPException(status_code=400, detail="Use at most 2 decimal places")
    return v


@router.post("/project-approvals/{pa_id}/request", response_model=ProjectApprovalOut)
async def request_approval(
    pa_id: int,
    background_tasks: BackgroundTasks,
    reason: str = Form(""),
    amount: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pa = await _load_pa(db, pa_id)
    project = await _load_project(db, pa.project_id)
    t = pa.approval_type
    if not _can_request(user, project):
        raise HTTPException(status_code=403, detail="Only the project lead or a manager of this project can ask for approval")
    if not t.is_active:
        raise HTTPException(status_code=400, detail=f"'{t.name}' is inactive")
    if pa.status not in OPEN:
        raise HTTPException(status_code=400, detail=f"'{t.name}' is {pa.status.lower()}; it cannot be requested again now")
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Please give a reason")
    if len(reason) > 4000:
        raise HTTPException(status_code=400, detail="The reason is too long (4000 characters at most)")
    value = _parse_amount(amount)
    if t.requires_amount and value is None:
        raise HTTPException(status_code=400, detail="Please enter the amount")
    if not t.requires_amount:
        value = None

    if file is not None and file.filename:
        content = await file.read()
        if len(content) > MAX_FILE:
            raise HTTPException(status_code=400, detail="The file is too large (15 MB at most)")
        folder = os.path.join(UPLOAD_DIR, str(pa.id))
        os.makedirs(folder, exist_ok=True)
        safe = os.path.basename(file.filename).replace("..", "_")
        path = os.path.join(folder, f"{uuid.uuid4().hex}_{safe}")
        with open(path, "wb") as fh:
            fh.write(content)
        pa.attachment_name, pa.attachment_path = safe, path
        pa.attachment_type = file.content_type or "application/octet-stream"
    if t.requires_attachment and not pa.attachment_path:
        raise HTTPException(status_code=400, detail="Please attach a file")

    now = datetime.now(timezone.utc)
    again = pa.status != ApprovalStatus.NOT_REQUESTED.value
    pa.status = ApprovalStatus.PENDING.value
    pa.amount, pa.reason, pa.requested_by, pa.requested_at = value, reason, user.id, now
    pa.approved_amount = pa.decided_by = pa.decided_at = pa.decision_comment = None
    db.add(ApprovalEvent(project_approval_id=pa.id, action="requested", actor_id=user.id, amount=value, comment=reason,
                         attachment_name=pa.attachment_name))
    await log_activity(db, user.id, "approval_requested", "project", project.id,
                       detail=f"{t.name}{' (again)' if again else ''}" + (f": PKR {value:,.2f}" if value is not None else ""))
    await db.commit()
    await db.refresh(pa, ["events", "requester", "decider"])
    deciders, _ = await _deciders(db, pa)
    background_tasks.add_task(_email_request, [u.email for u in deciders], project.id, project.name, t.name, user.name, _money(value), reason)
    return await _pa_out(db, pa, user, project)


@router.post("/project-approvals/{pa_id}/decide", response_model=ProjectApprovalOut)
async def decide(pa_id: int, payload: DecisionIn, background_tasks: BackgroundTasks,
                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pa = await _load_pa(db, pa_id)
    t = pa.approval_type
    if pa.status != ApprovalStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="This request is not waiting for a decision")
    if pa.requested_by == user.id:
        raise HTTPException(status_code=403, detail="You cannot decide on a request you made")
    deciders, _ = await _deciders(db, pa)
    if not any(u.id == user.id for u in deciders):
        raise HTTPException(status_code=403, detail=f"You are not an approver for '{t.name}'")
    comment = (payload.comment or "").strip() or None
    now = datetime.now(timezone.utc)
    if payload.action == "approve":
        approved = None
        if t.requires_amount:
            approved = payload.approved_amount if payload.approved_amount is not None else pa.amount
            if pa.amount is not None and approved > pa.amount:
                raise HTTPException(status_code=400, detail="The approved amount cannot be more than the amount requested")
        pa.status, pa.approved_amount = ApprovalStatus.APPROVED.value, approved
        action, amount = "approved", approved
    else:
        if not comment:
            raise HTTPException(status_code=400, detail="Please give a reason")
        pa.status = ApprovalStatus.REJECTED.value if payload.action == "reject" else ApprovalStatus.SENT_BACK.value
        action, amount = ("rejected" if payload.action == "reject" else "sent_back"), None
    pa.decided_by, pa.decided_at, pa.decision_comment = user.id, now, comment
    db.add(ApprovalEvent(project_approval_id=pa.id, action=action, actor_id=user.id, amount=amount, comment=comment))
    label = {"approved": "approved", "rejected": "rejected", "sent_back": "sent back"}[action]
    await log_activity(db, user.id, f"approval_{action}", "project", pa.project_id,
                       detail=f"{t.name} {label}" + (f": PKR {amount:,.2f}" if amount is not None else ""))
    await db.commit()
    await db.refresh(pa, ["events", "requester", "decider"])
    project = await _load_project(db, pa.project_id)
    to = {u.email for u in (pa.requester, project.lead) if u is not None and u.id != user.id}
    background_tasks.add_task(_email_decision, list(to), project.id, project.name, t.name, label, user.name, _money(amount), comment)
    return await _pa_out(db, pa, user, project if can_view_project(user, project) else None, project.name)


@router.get("/project-approvals/{pa_id}/attachment")
async def approval_attachment(pa_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pa = await _load_pa(db, pa_id)
    project = await _load_project(db, pa.project_id)
    allowed = can_view_project(user, project)
    if not allowed:
        deciders, _ = await _deciders(db, pa)
        allowed = any(u.id == user.id for u in deciders) or pa.decided_by == user.id
    if not allowed or not pa.attachment_path or not os.path.exists(pa.attachment_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(pa.attachment_path, media_type=pa.attachment_type or "application/octet-stream", filename=pa.attachment_name)


# --------------------------------------------------------------------------- inbox
async def _waiting_for(db: AsyncSession, user: User) -> list[ProjectApproval]:
    pending = (await db.execute(
        select(ProjectApproval).where(ProjectApproval.status == ApprovalStatus.PENDING.value).order_by(ProjectApproval.requested_at)
    )).scalars().all()
    out = []
    for pa in pending:
        if pa.requested_by == user.id:
            continue
        deciders, _ = await _deciders(db, pa)
        if any(u.id == user.id for u in deciders):
            out.append(pa)
    return out


@router.get("/approvals/me", response_model=ApprovalsMe)
async def approvals_me(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    waiting = await _waiting_for(db, user)
    listed = False
    for t in (await db.execute(select(ApprovalType).where(ApprovalType.is_active.is_(True)))).scalars().all():
        if any(r.id == user.role_id for r in t.roles) or any(u.id == user.id for u in t.users):
            listed = True
            break
    decided_before = (await db.execute(select(func.count()).select_from(ProjectApproval).where(ProjectApproval.decided_by == user.id))).scalar() or 0
    return ApprovalsMe(is_approver=listed or bool(waiting) or decided_before > 0 or is_admin(user), pending_count=len(waiting))


@router.get("/approvals/inbox", response_model=list[ProjectApprovalOut])
async def inbox(status: str = Query("pending", pattern="^(pending|decided)$"), db: AsyncSession = Depends(get_db),
                user: User = Depends(get_current_user)):
    if status == "pending":
        rows = await _waiting_for(db, user)
    else:
        rows = (await db.execute(
            select(ProjectApproval).where(ProjectApproval.decided_by == user.id).order_by(ProjectApproval.decided_at.desc()).limit(200)
        )).scalars().all()
    projects: dict[int, Project] = {}
    for pid in {r.project_id for r in rows}:
        projects[pid] = await _load_project(db, pid)
    out = []
    for pa in rows:
        p = projects[pa.project_id]
        o = await _pa_out(db, pa, user, None, p.name)
        o.can_open_project = can_view_project(user, p)
        out.append(o)
    return out


# --------------------------------------------------------------------------- emails (run after the response)
async def _email_request(to: list[str], project_id: int, project_name: str, type_name: str, by: str, amount: float | None, reason: str):
    subject, body = email_templates.approval_requested_email(project_id, project_name, type_name, by, amount, reason)
    for addr in to:
        await send_email(addr, subject, body)


async def _email_decision(to: list[str], project_id: int, project_name: str, type_name: str, label: str, by: str,
                          amount: float | None, comment: str | None):
    subject, body = email_templates.approval_decided_email(project_id, project_name, type_name, label, by, amount, comment)
    for addr in to:
        await send_email(addr, subject, body)
