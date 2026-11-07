from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
import os
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    require_permission, get_current_user, has_permission, get_scoped_department_ids,
    user_load_options, can_assign_role, load_assign_context, is_admin,
    scope_load_options, effective_pairs, covers_area, covers_station,
    get_scope_pairs, placement_in_scope,
)
from app.core.security import hash_password
from app.database import get_db
from app.models.user import (
    User, UserManagedPair, user_managed_department, user_managed_area, user_managed_station, user_extra_assignable_role,
)
from app.models.organization import Area, Station, Division
from app.models.role import Role
from app.models.department import Department
from app.models.task import Task
from app.models.project import Project, ProjectTeam
from app.models.subtask import SubTask, SubTaskAssignee
from app.models.report import Report
from app.models.attachment import Attachment
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.schemas.user import UserOut, UserUpdate, AssignRoleRequest, AssignDepartmentRequest, UserCreate, PerformanceCategoryOut, UserPerformanceOut, ChangePasswordRequest
from app.services import notification_dispatch
from app.services.activity_log import log_activity
from app.schemas.activity_log import ActivityLogOut

router = APIRouter(prefix="/users", tags=["users"])
UPLOAD_DIR = "uploads"
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB



async def _protect_admin_account(db: AsyncSession, current_user: User, user_id: int) -> None:
    """Only the main Admin may change, deactivate or delete an Admin account."""
    if is_admin(current_user):
        return
    target_is_admin = (await db.execute(
        select(Role.is_system).join(User, User.role_id == Role.id).where(User.id == user_id)
    )).scalar()
    if target_is_admin:
        raise HTTPException(status_code=403, detail="Only the main Admin can change an Admin account.")

@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User list access is now scoped based on user:view permissions."""
    if not has_permission(current_user, "user:view"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")
    
    query = select(User).options(*user_load_options())
    
    my_pairs = get_scope_pairs(current_user)
    if my_pairs is not None:
        if not my_pairs:
            return []  # Empty scope = no users visible
        # Station-aware: people who work at a department-at-station I manage
        from sqlalchemy import tuple_
        query = query.where(tuple_(User.station_id, User.department_id).in_(list(my_pairs)))
    
    result = await db.execute(query)
    return result.scalars().all()


async def _load_user_out(db: AsyncSession, user_id: int) -> User:
    """Re-fetch a user with everything UserOut needs (avoids MissingGreenlet)."""
    result = await db.execute(
        select(User).options(*user_load_options()).where(User.id == user_id)
    )
    return result.scalar_one()


async def _validate_department_ids(db: AsyncSession, dept_ids: list[int]) -> None:
    for dept_id in set(dept_ids):
        dept_result = await db.execute(select(Department).where(Department.id == dept_id))
        if dept_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"Department with id {dept_id} not found")


# ---------------------------------------------------------------------------
# Employee code and placement (where the person works)
# ---------------------------------------------------------------------------
async def _check_code_unique(db: AsyncSession, code: str, exclude_user_id: int | None = None) -> None:
    q = select(User.id).where(User.employee_code == code)
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    if (await db.execute(q)).first() is not None:
        raise HTTPException(status_code=400, detail=f"Employee Code {code} is already used by another user")


async def _validate_placement(
    db: AsyncSession, area_id: int | None, station_id: int | None, department_id: int | None,
    required: bool,
) -> None:
    """Area -> Station (in that area) -> Department (at that station). One placement per person."""
    if area_id is None and station_id is None and department_id is None and not required:
        return
    if area_id is None or station_id is None or department_id is None:
        raise HTTPException(status_code=400, detail="Please select the Area, Station and Department where this person works")
    area = await db.get(Area, area_id)
    if area is None:
        raise HTTPException(status_code=404, detail="Area not found")
    station = (await db.execute(
        select(Station).options(selectinload(Station.departments)).where(Station.id == station_id)
    )).scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    if station.area_id != area_id:
        raise HTTPException(status_code=400, detail=f"Station '{station.name}' is not in area '{area.name}'")
    if department_id not in {d.id for d in station.departments}:
        dept = await db.get(Department, department_id)
        if dept is None:
            raise HTTPException(status_code=404, detail="Department not found")
        raise HTTPException(status_code=400, detail=f"Department '{dept.name}' is not at station '{station.name}'")


async def _validate_division(db: AsyncSession, division_id: int | None) -> None:
    if division_id is not None and await db.get(Division, division_id) is None:
        raise HTTPException(status_code=404, detail="Division not found")


# ---------------------------------------------------------------------------
# What a user manages: whole Areas, whole Stations, single Departments
# ---------------------------------------------------------------------------
class Scope:
    """What a user manages: whole areas, whole stations, and single departments AT a
    station (pairs of (station_id, department_id))."""
    def __init__(self, areas: list[Area], stations: list[Station], pairs: list[tuple[int, int]]):
        self.areas, self.stations, self.pairs = areas, stations, pairs

    @property
    def all_pairs(self) -> set[tuple[int, int]]:
        out = set(self.pairs)
        for st in self.stations:
            out |= {(st.id, d.id) for d in st.departments}
        for a in self.areas:
            for st in a.stations:
                out |= {(st.id, d.id) for d in st.departments}
        return out

    @property
    def department_ids(self) -> set[int]:
        return {d for _, d in self.all_pairs}

    @property
    def is_empty(self) -> bool:
        return not (self.areas or self.stations or self.pairs)


def _pair_keys(items) -> list[tuple[int, int]]:
    out = []
    for it in items or []:
        sid, did = (it.station_id, it.department_id) if hasattr(it, "station_id") else (it["station_id"], it["department_id"])
        if (sid, did) not in out:
            out.append((sid, did))
    return out


async def _load_scope(db: AsyncSession, area_ids, station_ids, pairs) -> Scope:
    """Load and validate the ticked items, and drop ticks already covered by a wider tick."""
    area_ids, station_ids = (list(dict.fromkeys(x or [])) for x in (area_ids, station_ids))
    pairs = _pair_keys(pairs)
    areas = (await db.execute(
        select(Area).options(selectinload(Area.stations).selectinload(Station.departments)).where(Area.id.in_(area_ids))
    )).scalars().all() if area_ids else []
    if len(areas) != len(area_ids):
        raise HTTPException(status_code=404, detail="One of the selected areas was not found")
    stations = (await db.execute(
        select(Station).options(selectinload(Station.departments)).where(Station.id.in_(station_ids))
    )).scalars().all() if station_ids else []
    if len(stations) != len(station_ids):
        raise HTTPException(status_code=404, detail="One of the selected stations was not found")
    if pairs:
        pair_stations = {st.id: st for st in (await db.execute(
            select(Station).options(selectinload(Station.departments)).where(Station.id.in_({s for s, _ in pairs}))
        )).scalars().all()}
        for sid, did in pairs:
            st = pair_stations.get(sid)
            if st is None:
                raise HTTPException(status_code=404, detail="One of the selected stations was not found")
            if did not in {d.id for d in st.departments}:
                raise HTTPException(status_code=400, detail=f"A selected department is not at station '{st.name}'")
    whole_area_ids = {a.id for a in areas}
    stations = [st for st in stations if st.area_id not in whole_area_ids]
    covered = Scope(list(areas), stations, []).all_pairs
    pairs = [p for p in pairs if p not in covered]
    return Scope(list(areas), stations, pairs)


def _check_scope_grant(current_user: User, manage_all: bool | None, scope: Scope | None) -> None:
    """
    No-escalation rule: someone who does not manage everything cannot grant "All",
    can give a whole Area only if they manage that whole Area, a whole Station only
    if they manage it (or its whole Area), and a department at a station only if
    they manage that department at that station.
    """
    mine = get_scope_pairs(current_user)
    if mine is None:
        return
    if manage_all:
        raise HTTPException(status_code=403, detail="Only users who manage everything can grant 'All'")
    if scope is None:
        return
    for area in scope.areas:
        if not covers_area(current_user, area.id):
            raise HTTPException(status_code=403, detail=f"You can only give the whole area '{area.name}' if you manage all of it yourself")
    for st in scope.stations:
        if not covers_station(current_user, st):
            raise HTTPException(status_code=403, detail=f"You can only give the whole station '{st.name}' if you manage all of it yourself")
    if set(scope.pairs) - mine:
        raise HTTPException(status_code=403, detail="You can only grant departments (at a station) that you manage yourself")


async def _write_scope(db: AsyncSession, user_id: int, scope: Scope) -> None:
    await _clear_scope(db, user_id)
    for a in scope.areas:
        await db.execute(user_managed_area.insert().values(user_id=user_id, area_id=a.id))
    for st in scope.stations:
        await db.execute(user_managed_station.insert().values(user_id=user_id, station_id=st.id))
    for sid, did in scope.pairs:
        await db.execute(UserManagedPair.__table__.insert().values(user_id=user_id, station_id=sid, department_id=did))


async def _clear_scope(db: AsyncSession, user_id: int) -> None:
    pt = UserManagedPair.__table__
    await db.execute(pt.delete().where(pt.c.user_id == user_id))
    await db.execute(user_managed_area.delete().where(user_managed_area.c.user_id == user_id))
    await db.execute(user_managed_station.delete().where(user_managed_station.c.user_id == user_id))
    await db.execute(user_managed_department.delete().where(user_managed_department.c.user_id == user_id))


async def _resolve_extra_roles(
    db: AsyncSession,
    current_user: User,
    requested_ids: list[int],
    existing: list[Role] | None = None,
) -> list[Role]:
    """
    Lock 1 — you can only give what you can give: every requested extra role
    must be a role the CURRENT user is allowed to assign.
    On update, extras the current user cannot assign (granted earlier by
    someone with wider authority) are preserved rather than silently removed.
    """
    requested_ids = list(dict.fromkeys(requested_ids))
    roles: list[Role] = []
    for role_id in requested_ids:
        role_result = await db.execute(select(Role).where(Role.id == role_id))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail=f"Role with id {role_id} not found")
        if not can_assign_role(current_user, role):
            raise HTTPException(status_code=403, detail=f"You cannot grant '{role.name}' as an extra assignable role")
        roles.append(role)
    if existing:
        kept = [r for r in existing if r.id not in requested_ids and not can_assign_role(current_user, r)]
        roles = kept + roles
    return roles


async def _replace_extra_roles(db: AsyncSession, user_id: int, roles: list[Role]) -> None:
    await db.execute(user_extra_assignable_role.delete().where(user_extra_assignable_role.c.user_id == user_id))
    for role in roles:
        await db.execute(user_extra_assignable_role.insert().values(user_id=user_id, role_id=role.id))


# ---------------------------------------------------------------------------
# Which sections of the user form apply to which roles.
# The frontend uses the SAME list (utils/roleAccess.ts → SCOPE_PERMISSIONS).
# ---------------------------------------------------------------------------
# Permissions whose reach is limited by "Departments this user manages".
# A role with none of these gets no benefit from a department scope.
SCOPE_PERMISSIONS = {"project:view", "project:manage", "user:view", "user:manage"}


def role_uses_department_scope(role: Role | None) -> bool:
    return role is not None and any(p.name in SCOPE_PERMISSIONS for p in role.permissions)


def role_can_manage_users(role: Role | None) -> bool:
    """Only people who can create users / give roles need extra assignable roles."""
    return role is not None and any(p.name == "user:manage" for p in role.permissions)


async def _load_role_with_permissions(db: AsyncSession, role_id: int | None) -> Role | None:
    if role_id is None:
        return None
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
    return result.scalar_one_or_none()


def _check_extras_fit_scope(extra_roles: list[Role], manage_all: bool, managed_ids: set[int]) -> None:
    """
    A role tagged to a department can only ever be assigned by someone who manages
    that department, so giving it as an extra to a user who does NOT manage that
    department would be useless. Reject it with a clear message.
    """
    if manage_all:
        return
    for role in extra_roles:
        if role.department_tag_id is not None and role.department_tag_id not in managed_ids:
            raise HTTPException(
                status_code=400,
                detail=f"'{role.name}' belongs to a department this user does not manage. "
                       f"Tick that department under 'What this user manages' first.",
            )


async def _enforce_form_rules(db: AsyncSession, user_id: int) -> list[str]:
    """
    Keeps a user's data consistent with their CURRENT role (run after every save):
      - role has no department-based permission → clear "All Departments" and managed departments
      - role has no user:manage                 → clear extra assignable roles
      - otherwise drop extras tagged to a department the user does not manage
    Returns the names of what was cleared (for the activity log).
    """
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions),
            *scope_load_options(),
            selectinload(User.extra_assignable_roles),
        )
        .where(User.id == user_id)
        # re-read links written earlier in this request (callers flush first)
        .execution_options(populate_existing=True)
    )
    user = result.scalar_one()
    cleared: list[str] = []

    if not role_uses_department_scope(user.role):
        if user.manage_all_departments or user.managed_pairs or user.managed_stations or user.managed_areas:
            user.manage_all_departments = False
            await _clear_scope(db, user_id)
            cleared.append("managed_scope")
        managed_ids: set[int] = set()
        manage_all = False
    else:
        managed_ids = {d for _, d in effective_pairs(user.managed_areas, user.managed_stations, user.managed_pairs)}
        manage_all = user.manage_all_departments

    if not role_can_manage_users(user.role):
        if user.extra_assignable_roles:
            await db.execute(user_extra_assignable_role.delete().where(user_extra_assignable_role.c.user_id == user_id))
            cleared.append("extra_assignable_roles")
    elif not manage_all:
        unusable = [
            r.id for r in user.extra_assignable_roles
            if r.department_tag_id is not None and r.department_tag_id not in managed_ids
        ]
        if unusable:
            await db.execute(
                user_extra_assignable_role.delete().where(
                    (user_extra_assignable_role.c.user_id == user_id)
                    & (user_extra_assignable_role.c.role_id.in_(unusable))
                )
            )
            cleared.append("extra_assignable_roles")
    return cleared


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email already registered")
    await _check_code_unique(db, payload.employee_code)

    # ---- Validate EVERYTHING before writing anything ----
    await load_assign_context(db, current_user)   # needed by can_assign_role()
    my_pairs = get_scope_pairs(current_user)

    # Placement: a scoped creator must place the user at a department-at-station
    # they manage (otherwise they could not see the user).
    if my_pairs is not None:
        if not my_pairs:
            raise HTTPException(
                status_code=403,
                detail="You cannot create users because you do not manage any department",
            )
        if (payload.station_id, payload.department_id) not in my_pairs:
            raise HTTPException(status_code=403, detail="You can only add users to departments (at a station) you manage")
    await _validate_placement(db, payload.area_id, payload.station_id, payload.department_id, required=True)
    await _validate_division(db, payload.division_id)

    # Role: base list + creator's extras, filtered by department tag
    role = None
    if payload.role_id is not None:
        role = await _load_role_with_permissions(db, payload.role_id)
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")
        if current_user.role is None:
            raise HTTPException(status_code=403, detail="You cannot assign roles because you have no role")
        if not can_assign_role(current_user, role):
            raise HTTPException(status_code=403, detail="You are not allowed to assign this role")

    # What this new user will MANAGE (no escalation).
    # Only kept when the role has a department-based permission; otherwise it would do nothing.
    if role_uses_department_scope(role):
        manage_all = payload.manage_all_departments
        scope = Scope([], [], []) if manage_all else await _load_scope(
            db, payload.managed_area_ids, payload.managed_station_ids, payload.managed_pairs
        )
    else:
        manage_all = False
        scope = Scope([], [], [])
    _check_scope_grant(current_user, manage_all, scope)

    # Personal extra assignable roles (Lock 1) — only for roles that can manage users
    extra_roles: list[Role] = []
    if role_can_manage_users(role):
        extra_roles = await _resolve_extra_roles(db, current_user, payload.extra_assignable_role_ids)
        _check_extras_fit_scope(extra_roles, manage_all, scope.department_ids)

    # ---- Write ----
    user = User(
        name=payload.name.strip(),
        email=payload.email,
        hashed_password=hash_password(payload.password),
        employee_code=payload.employee_code,
        joining_date=payload.joining_date,
        role_id=payload.role_id,
        area_id=payload.area_id,
        station_id=payload.station_id,
        department_id=payload.department_id,
        division_id=payload.division_id,
        is_active=payload.is_active,
        manage_all_departments=manage_all,
    )
    db.add(user)
    await db.flush()  # get user.id

    await _write_scope(db, user.id, scope)
    await _replace_extra_roles(db, user.id, extra_roles)
    await log_activity(db, current_user.id, "user_created", "user", user.id, detail=f"Account created by {current_user.name}")
    await db.flush()
    await _enforce_form_rules(db, user.id)
    await db.commit()

    if payload.send_welcome_email:
        background_tasks.add_task(notification_dispatch.notify_user_created, user.id)

    return await _load_user_out(db, user.id)


@router.get("/me", response_model=UserOut)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any logged-in user can see their own profile — no special permission needed."""
    # get_current_user loads only what permission checks need; load the full profile here
    return await _load_user_out(db, current_user.id)


@router.get("/me/permissions", response_model=list[str])
async def get_me_permissions(current_user: User = Depends(get_current_user)):
    """Any logged-in user can see their own permissions list."""
    if current_user.role is None:
        return []
    return [p.name for p in current_user.role.permissions]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")
    
    result = await db.execute(
        select(User)
        .options(*user_load_options())
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Department-tier users can only view users in their scoped departments
    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, user):
        raise HTTPException(status_code=404, detail="User not found")
    
    return user


@router.get("/{user_id}/performance", response_model=UserPerformanceOut)
async def get_user_performance(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")

    target_result = await db.execute(select(User).where(User.id == user_id))
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, target_user):
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)

    async def _category_stats(model, lead_or_assignee_filter):
        result = await db.execute(select(model).where(lead_or_assignee_filter))
        items = result.scalars().all()
        total = len(items)
        completed = sum(1 for i in items if i.completed_at is not None)
        on_time = sum(
            1 for i in items
            if i.completed_at is not None and (i.due_date is None or i.completed_at <= i.due_date)
        )
        late = sum(
            1 for i in items
            if i.completed_at is not None and i.due_date is not None and i.completed_at > i.due_date
        )
        overdue = sum(
            1 for i in items
            if i.completed_at is None and i.due_date is not None and i.due_date < now
        )
        pending = total - completed - overdue
        return PerformanceCategoryOut(
            total=total, completed=completed, on_time=on_time,
            late=late, overdue=overdue, pending=pending,
        )

    projects_stats = await _category_stats(Project, Project.lead_id == user_id)
    tasks_stats = await _category_stats(Task, Task.lead_id == user_id)

    # Subtasks are many-to-many via SubTaskAssignee, handle separately
    subtask_result = await db.execute(
        select(SubTask)
        .join(SubTaskAssignee, SubTaskAssignee.subtask_id == SubTask.id)
        .where(SubTaskAssignee.user_id == user_id)
    )
    subtask_items = subtask_result.scalars().all()
    st_total = len(subtask_items)
    st_completed = sum(1 for i in subtask_items if i.completed_at is not None)
    st_on_time = sum(
        1 for i in subtask_items
        if i.completed_at is not None and (i.due_date is None or i.completed_at <= i.due_date)
    )
    st_late = sum(
        1 for i in subtask_items
        if i.completed_at is not None and i.due_date is not None and i.completed_at > i.due_date
    )
    st_overdue = sum(
        1 for i in subtask_items
        if i.completed_at is None and i.due_date is not None and i.due_date < now
    )
    st_pending = st_total - st_completed - st_overdue
    subtasks_stats = PerformanceCategoryOut(
        total=st_total, completed=st_completed, on_time=st_on_time,
        late=st_late, overdue=st_overdue, pending=st_pending,
    )

    return UserPerformanceOut(
        projects=projects_stats, tasks=tasks_stats, subtasks=subtasks_stats,
    )


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _protect_admin_account(db, current_user, user_id)
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    result = await db.execute(
        select(User).options(*user_load_options()).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Department-tier users can only edit users in their scoped departments
    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, user):
        raise HTTPException(status_code=404, detail="User not found")

    # Only fields the client actually sent are applied
    sent = payload.model_fields_set
    changed_fields = []

    if payload.name is not None:
        user.name = payload.name
        changed_fields.append("name")
    if payload.email is not None:
        existing = await db.execute(
            select(User).where(User.email == payload.email, User.id != user_id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = payload.email
        changed_fields.append("email")
    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changed_fields.append("is_active")

    target_is_admin = bool(user.role and user.role.is_system)

    # Employee Code: numbers only, unique; only the main Admin's account may be left empty
    if "employee_code" in sent and payload.employee_code != user.employee_code:
        if payload.employee_code is None:
            if not target_is_admin:
                raise HTTPException(status_code=400, detail="Employee Code is required")
        else:
            await _check_code_unique(db, payload.employee_code, exclude_user_id=user_id)
        user.employee_code = payload.employee_code
        changed_fields.append("employee_code")

    if "joining_date" in sent and payload.joining_date != user.joining_date:
        user.joining_date = payload.joining_date
        changed_fields.append("joining_date")

    # Placement (Area -> Station -> Department). Fields not sent keep their value.
    if sent & {"area_id", "station_id", "department_id"}:
        new_area = (payload.area_id or None) if "area_id" in sent else user.area_id
        new_station = (payload.station_id or None) if "station_id" in sent else user.station_id
        new_dept = (payload.department_id or None) if "department_id" in sent else user.department_id
        if my_pairs is not None and (new_station, new_dept) not in my_pairs:
            raise HTTPException(status_code=403, detail="You can only place users in departments (at a station) you manage")
        await _validate_placement(db, new_area, new_station, new_dept, required=not target_is_admin)
        if (new_area, new_station, new_dept) != (user.area_id, user.station_id, user.department_id):
            user.area_id, user.station_id, user.department_id = new_area, new_station, new_dept
            changed_fields.append("placement")

    if "division_id" in sent and (payload.division_id or None) != user.division_id:
        await _validate_division(db, payload.division_id or None)
        user.division_id = payload.division_id or None
        changed_fields.append("division")

    # Manager (null = clear)
    if "manager_id" in sent:
        if payload.manager_id is not None:
            if payload.manager_id == user_id:
                raise HTTPException(status_code=400, detail="A user cannot be their own manager")
            manager_result = await db.execute(select(User).where(User.id == payload.manager_id))
            if manager_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="Manager not found")
        if payload.manager_id != user.manager_id:
            user.manager_id = payload.manager_id
            changed_fields.append("manager_id")

    # Sections that do not apply to this user's role are ignored here and cleared
    # by _enforce_form_rules() below. (When the role is changed in the same edit,
    # the frontend saves the role FIRST, so these checks see the new role.)
    uses_scope = role_uses_department_scope(user.role)
    manages_users = role_can_manage_users(user.role)

    # "All" toggle — only someone who manages everything may change it
    if uses_scope and payload.manage_all_departments is not None and payload.manage_all_departments != user.manage_all_departments:
        if my_pairs is not None:
            raise HTTPException(status_code=403, detail="Only users who manage everything can change 'All'")
        user.manage_all_departments = payload.manage_all_departments
        changed_fields.append("manage_all_departments")

    # What this user manages: whole areas, whole stations, departments at a station
    final_managed_ids = {d for _, d in effective_pairs(user.managed_areas, user.managed_stations, user.managed_pairs)}
    scope_sent = sent & {"managed_area_ids", "managed_station_ids", "managed_pairs"}
    if uses_scope and scope_sent and not user.manage_all_departments:
        old_p = [(x.station_id, x.department_id) for x in user.managed_pairs]
        requested = await _load_scope(
            db,
            payload.managed_area_ids if "managed_area_ids" in sent else [a.id for a in user.managed_areas],
            payload.managed_station_ids if "managed_station_ids" in sent else [x.id for x in user.managed_stations],
            payload.managed_pairs if "managed_pairs" in sent else [{"station_id": s_, "department_id": d_} for s_, d_ in old_p],
        )
        # Only check what is NEW; keep what the editor cannot see or give
        # (granted earlier by someone with wider authority).
        old_a = {a.id for a in user.managed_areas}
        old_s = {x.id for x in user.managed_stations}
        _check_scope_grant(current_user, None, Scope(
            [a for a in requested.areas if a.id not in old_a],
            [x for x in requested.stations if x.id not in old_s],
            [p for p in requested.pairs if p not in set(old_p)],
        ))
        if my_pairs is not None:
            req_a = {a.id for a in requested.areas}
            req_s = {x.id for x in requested.stations}
            req_p = set(requested.pairs)
            keep_a = [a.id for a in user.managed_areas if a.id not in req_a and not covers_area(current_user, a.id)]
            keep_s = [x.id for x in user.managed_stations if x.id not in req_s and not covers_station(current_user, x)]
            keep_p = [p for p in old_p if p not in req_p and p not in my_pairs]
            if keep_a or keep_s or keep_p:
                requested = await _load_scope(
                    db, list(req_a) + keep_a, list(req_s) + keep_s,
                    [{"station_id": s_, "department_id": d_} for s_, d_ in list(req_p) + keep_p],
                )
        await _write_scope(db, user.id, requested)
        final_managed_ids = requested.department_ids
        changed_fields.append("managed_scope")

    # Someone who manages everything does not also need a list
    if user.manage_all_departments and payload.manage_all_departments:
        await _clear_scope(db, user_id)
        final_managed_ids = set()

    # Personal extra assignable roles (Lock 1) — only for roles that can manage users
    if manages_users and payload.extra_assignable_role_ids is not None:
        await load_assign_context(db, current_user)   # needed by can_assign_role()
        extra_roles = await _resolve_extra_roles(
            db, current_user, payload.extra_assignable_role_ids, existing=list(user.extra_assignable_roles)
        )
        # Newly chosen extras must fit the departments this user will manage
        newly_requested = set(payload.extra_assignable_role_ids)
        _check_extras_fit_scope(
            [r for r in extra_roles if r.id in newly_requested],
            user.manage_all_departments,
            final_managed_ids,
        )
        await _replace_extra_roles(db, user.id, extra_roles)
        changed_fields.append("extra_assignable_roles")

    await db.flush()
    for cleared in await _enforce_form_rules(db, user_id):
        if cleared not in changed_fields:
            changed_fields.append(cleared)

    if changed_fields:
        await log_activity(db, current_user.id, "user_updated", "user", user.id, detail=f"Updated: {', '.join(changed_fields)}")
    if payload.password is not None:
        await log_activity(db, current_user.id, "password_changed", "user", user.id, detail="Password changed")
    await db.commit()

    db.expire_all()
    return await _load_user_out(db, user_id)


@router.patch("/{user_id}/role", response_model=UserOut)
async def assign_role(
    user_id: int,
    payload: AssignRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _protect_admin_account(db, current_user, user_id)
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Department-tier users can only edit users in their scoped departments
    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, user):
        raise HTTPException(status_code=404, detail="User not found")

    role = None
    if payload.role_id is None:
        user.role_id = None
    else:
        role_result = await db.execute(select(Role).where(Role.id == payload.role_id))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")
        if current_user.role is None:
            raise HTTPException(status_code=403, detail="You cannot assign roles because you have no role")
        await load_assign_context(db, current_user)   # needed by can_assign_role()
        # Base list + current user's personal extras, then department-tag filter
        if not can_assign_role(current_user, role):
            raise HTTPException(status_code=403, detail="You are not allowed to assign this role")
        user.role_id = role.id

    await log_activity(db, current_user.id, "role_assigned", "user", user_id, detail=f"Role changed to '{role.name}'" if role else "Role removed")
    # The new role may not use department scope / extra roles → clear what no longer applies
    await db.flush()
    db.expire(user, ["role"])
    cleared = await _enforce_form_rules(db, user_id)
    if cleared:
        await log_activity(db, current_user.id, "user_updated", "user", user_id, detail=f"Cleared (not used by new role): {', '.join(cleared)}")
    await db.commit()

    db.expire_all()
    return await _load_user_out(db, user_id)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _protect_admin_account(db, current_user, user_id)
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Department-tier users can only delete users in their scoped departments
    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, user):
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    # Block if user created any tasks
    tasks_created_result = await db.execute(
        select(Task).where(Task.created_by == user_id)
    )
    if tasks_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created tasks that still exist. Reassign or delete those tasks before deleting the user."
        )

    # Block if user created any projects
    projects_created_result = await db.execute(
        select(Project).where(Project.created_by == user_id)
    )
    if projects_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created projects that still exist. Reassign or delete those projects before deleting the user."
        )

    # Block if user created any subtasks
    subtasks_created_result = await db.execute(
        select(SubTask).where(SubTask.created_by == user_id)
    )
    if subtasks_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user created subtasks that still exist. Reassign or delete those subtasks before deleting the user."
        )

    # Block if user authored any reports
    reports_created_result = await db.execute(
        select(Report).where(Report.created_by == user_id)
    )
    if reports_created_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user authored reports that still exist. Delete those reports before deleting the user."
        )

    # Block if user uploaded any attachments
    attachments_uploaded_result = await db.execute(
        select(Attachment).where(Attachment.uploaded_by == user_id)
    )
    if attachments_uploaded_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="This user uploaded attachments that still exist. Delete those attachments before deleting the user."
        )

    # Null out nullable role columns
    # Project.lead_id
    projects_lead_result = await db.execute(
        select(Project).where(Project.lead_id == user_id)
    )
    projects_lead = projects_lead_result.scalars().all()
    for project in projects_lead:
        project.lead_id = None

    # Task.lead_id
    tasks_lead_result = await db.execute(
        select(Task).where(Task.lead_id == user_id)
    )
    tasks_lead = tasks_lead_result.scalars().all()
    for task in tasks_lead:
        task.lead_id = None

    # Project.team_approved_by
    projects_approved_result = await db.execute(
        select(Project).where(Project.team_approved_by == user_id)
    )
    projects_approved = projects_approved_result.scalars().all()
    for project in projects_approved:
        project.team_approved_by = None

    # Task.team_approved_by
    tasks_approved_result = await db.execute(
        select(Task).where(Task.team_approved_by == user_id)
    )
    tasks_approved = tasks_approved_result.scalars().all()
    for task in tasks_approved:
        task.team_approved_by = None

    # Department.head_id
    departments_headed_result = await db.execute(
        select(Department).where(Department.head_id == user_id)
    )
    departments_headed = departments_headed_result.scalars().all()
    for dept in departments_headed:
        dept.head_id = None

    # Reassign NOT NULL audit trail columns to current_user
    # ProjectTeam.added_by
    project_teams_result = await db.execute(
        select(ProjectTeam).where(ProjectTeam.added_by == user_id)
    )
    project_teams = project_teams_result.scalars().all()
    for pt in project_teams:
        pt.added_by = current_user.id

    # TaskTeam.added_by
    from app.models.task import TaskTeam
    task_teams_result = await db.execute(
        select(TaskTeam).where(TaskTeam.added_by == user_id)
    )
    task_teams = task_teams_result.scalars().all()
    for tt in task_teams:
        tt.added_by = current_user.id

    # SubTaskAssignee.assigned_by
    subtask_assignees_result = await db.execute(
        select(SubTaskAssignee).where(SubTaskAssignee.assigned_by == user_id)
    )
    subtask_assignees = subtask_assignees_result.scalars().all()
    for sa in subtask_assignees:
        sa.assigned_by = current_user.id

    # ActivityLog.actor_id
    activity_logs_result = await db.execute(
        select(ActivityLog).where(ActivityLog.actor_id == user_id)
    )
    activity_logs = activity_logs_result.scalars().all()
    for log in activity_logs:
        log.actor_id = current_user.id

    # Comment.author_id
    comments_result = await db.execute(
        select(Comment).where(Comment.author_id == user_id)
    )
    comments = comments_result.scalars().all()
    for comment in comments:
        comment.author_id = current_user.id

    # Unassign tasks where this user is the assignee (existing logic)
    assigned_tasks_result = await db.execute(
        select(Task).where(Task.assigned_to == user_id)
    )
    assigned_tasks = assigned_tasks_result.scalars().all()
    for task in assigned_tasks:
        task.assigned_to = None

    # Clear this user's department-scope and extra-assignable-role links
    await db.execute(user_managed_department.delete().where(user_managed_department.c.user_id == user_id))
    await db.execute(user_extra_assignable_role.delete().where(user_extra_assignable_role.c.user_id == user_id))

    # Users who reported to this user no longer have a manager
    reports_to_result = await db.execute(select(User).where(User.manager_id == user_id))
    for report in reports_to_result.scalars().all():
        report.manager_id = None

    await db.delete(user)
    await db.commit()


@router.patch("/{user_id}/department", response_model=UserOut)
async def assign_department(
    user_id: int,
    payload: AssignDepartmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _protect_admin_account(db, current_user, user_id)
    """
    Assign a user to a department. Mirrors the assign_role endpoint pattern.
    Validates the department exists if not null, sets user.department_id,
    and returns the user with both role and department eager-loaded.
    """
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to manage users")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Department-tier users can only edit users in their scoped departments
    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, user):
        raise HTTPException(status_code=404, detail="User not found")

    department = None
    if payload.department_id is None:
        if my_pairs is not None:
            raise HTTPException(status_code=403, detail="You cannot remove a user from your departments")
        user.department_id = None
    else:
        if my_pairs is not None and (user.station_id, payload.department_id) not in my_pairs:
            raise HTTPException(status_code=403, detail="You can only assign users to departments you manage")
        dept_result = await db.execute(select(Department).where(Department.id == payload.department_id))
        department = dept_result.scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=404, detail="Department not found")
        if user.station_id is not None:
            await _validate_placement(db, user.area_id, user.station_id, department.id, required=True)
        user.department_id = department.id

    await log_activity(db, current_user.id, "department_assigned", "user", user_id, detail=f"Department changed to '{department.name}'" if department else "Department removed")
    await db.commit()

    db.expire_all()
    return await _load_user_out(db, user_id)

@router.get("/{user_id}/activity", response_model=list[ActivityLogOut])
async def get_user_activity(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to view users")

    target_result = await db.execute(select(User).where(User.id == user_id))
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    my_pairs = get_scope_pairs(current_user)
    if not placement_in_scope(current_user, target_user):
        raise HTTPException(status_code=404, detail="User not found")

    logs_result = await db.execute(
        select(ActivityLog)
        .where(
            (ActivityLog.actor_id == user_id) |
            ((ActivityLog.entity_type == "user") & (ActivityLog.entity_id == user_id))
        )
        .order_by(ActivityLog.created_at.desc())
    )
    return logs_result.scalars().all()

@router.post("/{user_id}/avatar", response_model=UserOut)
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _protect_admin_account(db, current_user, user_id)
    if current_user.id != user_id and not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="Not allowed to change this user's picture")

    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG, WEBP, or GIF)")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 2MB")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete old avatar file if one exists, before saving the new one
    if user.avatar_path and os.path.exists(user.avatar_path):
        os.remove(user.avatar_path)

    avatar_dir = os.path.join(UPLOAD_DIR, "avatars", str(user_id))
    os.makedirs(avatar_dir, exist_ok=True)
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    stored_path = os.path.join(avatar_dir, stored_name)

    with open(stored_path, "wb") as f:
        f.write(content)

    user.avatar_path = stored_path
    await db.commit()
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User)
        .options(*user_load_options())
        .where(User.id == user.id)
    )
    return result.scalar_one()

@router.delete("/{user_id}/avatar", response_model=UserOut)
async def delete_avatar(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _protect_admin_account(db, current_user, user_id)
    if current_user.id != user_id and not has_permission(current_user, "user:manage"):
        raise HTTPException(status_code=403, detail="Not allowed to change this user's picture")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.avatar_path and os.path.exists(user.avatar_path):
        os.remove(user.avatar_path)
    user.avatar_path = None

    await db.commit()
    # Re-fetch with eager load to avoid MissingGreenlet error
    result = await db.execute(
        select(User)
        .options(*user_load_options())
        .where(User.id == user.id)
    )
    return result.scalar_one()

@router.get("/{user_id}/avatar")
async def get_avatar(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.avatar_path or not os.path.exists(user.avatar_path):
        raise HTTPException(status_code=404, detail="No avatar found")
    return FileResponse(user.avatar_path)
