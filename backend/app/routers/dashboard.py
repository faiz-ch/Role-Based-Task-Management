"""
Dashboard endpoints.

WHO sees WHAT
  Manager dashboard  — anyone with project:view or project:manage, or who leads a project.
                       Shows projects / tasks / subtasks of the departments they manage
                       ("All Departments" = everything) plus projects they lead.
  Employee dashboard — everyone else: tasks assigned to them, tasks they lead, tasks whose
                       team they are on, and their subtasks.

FILTERS (all optional, on every endpoint) — they can only NARROW what the person is
already allowed to see; a department or project outside their view is refused (403).
  department_id   only projects of that department (and their tasks / subtasks)
  project_id      only that project
  due_from/due_to only items due in that window (ISO date-times; the browser sends
                  them already converted from the user's local "this week / month")
  overdue         only items past their due date and not finished

Speed: the database pre-selects candidate rows (scope, filters, dates) so we no longer
load every task in the system; the existing can_view_task / can_view_subtask checks
still make the final decision, so the visibility rules are unchanged.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_, and_, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, has_permission, get_scoped_department_ids, can_view_task, can_view_subtask, project_in_scope, get_scope_pairs
from app.database import get_db
from app.models.task import Task, TaskStatus, TaskTeam
from app.models.project import Project, ProjectStatus, project_department, project_station, project_division
from app.models.department import Department
from app.models.organization import Area, Station, Division
from app.models.user import User
from app.models.subtask import SubTask, SubTaskAssignee

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

FINISHED_PROJECT_STATUSES = (ProjectStatus.DONE, ProjectStatus.ARCHIVED)


# ---------------------------------------------------------------------------
# Who is a "manager" and how far their view reaches
# ---------------------------------------------------------------------------
def has_project_view(user: User) -> bool:
    """project:manage implies viewing too."""
    return has_permission(user, "project:view") or has_permission(user, "project:manage")


def project_scope(user: User) -> set[int] | None:
    """
    Departments whose projects this user sees on the dashboard because of their
    permissions: None = all departments, empty set = none (lead-only access).
    Department scope only counts together with a project permission.
    """
    if not has_project_view(user):
        return set()
    return get_scoped_department_ids(user)


async def user_is_manager(db: AsyncSession, current_user: User) -> bool:
    if has_project_view(current_user):
        return True
    led_result = await db.execute(
        select(func.count()).select_from(Project).where(Project.lead_id == current_user.id)
    )
    return (led_result.scalar() or 0) > 0


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
@dataclass
class DashFilter:
    department_id: int | None = None
    project_id: int | None = None
    due_from: datetime | None = None
    due_to: datetime | None = None
    overdue: bool = False
    area_id: int | None = None
    station_id: int | None = None
    division_id: int | None = None

    @property
    def narrows_projects(self) -> bool:
        return any(x is not None for x in (self.department_id, self.project_id, self.area_id, self.station_id, self.division_id))


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def dash_filter(
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    due_from: datetime | None = Query(None),
    due_to: datetime | None = Query(None),
    overdue: bool = Query(False),
    area_id: int | None = Query(None),
    station_id: int | None = Query(None),
    division_id: int | None = Query(None),
) -> DashFilter:
    f = DashFilter(department_id, project_id, _aware(due_from), _aware(due_to), overdue, area_id, station_id, division_id)
    if f.due_from and f.due_to and f.due_from > f.due_to:
        raise HTTPException(status_code=400, detail="'From' date must be before 'To' date")
    return f


def _project_ids_in_department(department_id: int):
    return select(project_department.c.project_id).where(project_department.c.department_id == department_id)


def _org_project_ids(f: DashFilter) -> list:
    """Sub-queries of project ids for the Area / Station / Division filters."""
    out = []
    if f.station_id is not None:
        out.append(select(project_station.c.project_id).where(project_station.c.station_id == f.station_id))
    if f.area_id is not None:
        out.append(
            select(project_station.c.project_id)
            .join(Station, Station.id == project_station.c.station_id)
            .where(Station.area_id == f.area_id)
        )
    if f.division_id is not None:
        out.append(select(project_division.c.project_id).where(project_division.c.division_id == f.division_id))
    return out


def _date_conditions(column, status_column, done_values, f: DashFilter, now: datetime) -> list:
    conds = []
    if f.due_from is not None:
        conds.append(column >= f.due_from)
    if f.due_to is not None:
        conds.append(column <= f.due_to)
    if f.overdue:
        conds.append(column.is_not(None))
        conds.append(column < now)
        conds.append(status_column.not_in(done_values))
    return conds


def _task_filter_conditions(f: DashFilter, now: datetime) -> list:
    """Conditions on Task for the filters (also used for subtasks via their parent task)."""
    conds = []
    if f.project_id is not None:
        conds.append(Task.project_id == f.project_id)
    if f.department_id is not None:
        conds.append(Task.project_id.in_(_project_ids_in_department(f.department_id)))
    for sub in _org_project_ids(f):
        conds.append(Task.project_id.in_(sub))
    return conds


# ---------------------------------------------------------------------------
# Overdue helpers (unchanged output)
# ---------------------------------------------------------------------------
def is_overdue(due_date: datetime | None, now: datetime) -> bool:
    if not due_date:
        return False
    d = due_date
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d < now


def calc_days_overdue(due_date: datetime, now: datetime) -> int:
    d = due_date
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return max(1, (now - d).days)


def compute_overdue_tasks(tasks: list[Task], now: datetime) -> list[dict]:
    overdue = []
    for task in tasks:
        if task.status != TaskStatus.DONE and is_overdue(task.due_date, now):
            days_od = calc_days_overdue(task.due_date, now)
            overdue.append({
                "id": task.id,
                "title": task.title,
                "days_overdue": days_od,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value if hasattr(task.status, "value") else str(task.status),
                "project_id": task.project_id,
                "project_name": task.project.name if task.project else None,
            })
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return overdue


def compute_overdue_subtasks(subtasks: list[SubTask], now: datetime) -> list[dict]:
    overdue = []
    for subtask in subtasks:
        if subtask.status != TaskStatus.DONE and is_overdue(subtask.due_date, now):
            days_od = calc_days_overdue(subtask.due_date, now)
            project_name = None
            if subtask.task and subtask.task.project:
                project_name = subtask.task.project.name
            overdue.append({
                "id": subtask.id,
                "title": subtask.title,
                "days_overdue": days_od,
                "due_date": subtask.due_date.isoformat(),
                "status": subtask.status.value if hasattr(subtask.status, "value") else str(subtask.status),
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
                "project_name": project_name,
            })
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return overdue


def compute_overdue_projects(projects: list[Project], now: datetime) -> list[dict]:
    overdue = []
    for project in projects:
        status_val = project.status.value if hasattr(project.status, "value") else str(project.status)
        if status_val not in ("Done", "Archived", ProjectStatus.DONE, ProjectStatus.ARCHIVED) and is_overdue(project.due_date, now):
            days_od = calc_days_overdue(project.due_date, now)
            dept_names = [d.name for d in project.departments] if project.departments else []
            dept_str = ", ".join(dept_names) if dept_names else (project.lead.name if project.lead else None)
            overdue.append({
                "id": project.id,
                "title": project.name,
                "days_overdue": days_od,
                "due_date": project.due_date.isoformat(),
                "status": status_val,
                "department_name": dept_str,
                "departments": dept_names,
                "lead_name": project.lead.name if project.lead else None,
            })
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return overdue


# ---------------------------------------------------------------------------
# Employee data: their own work
# ---------------------------------------------------------------------------
def _employee_task_condition(user: User):
    """Assigned to them, led by them, or they are on the task's team."""
    team_task_ids = select(TaskTeam.task_id).where(TaskTeam.user_id == user.id)
    return or_(Task.assigned_to == user.id, Task.lead_id == user.id, Task.id.in_(team_task_ids))


async def get_employee_tasks(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> list[Task]:
    f = f or DashFilter()
    now = datetime.now(timezone.utc)
    task_result = await db.execute(
        select(Task)
        .options(selectinload(Task.project))
        .where(
            _employee_task_condition(current_user),
            *_task_filter_conditions(f, now),
            *_date_conditions(Task.due_date, Task.status, [TaskStatus.DONE], f, now),
        )
    )
    return list(task_result.scalars().all())


async def get_employee_subtasks(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> list[SubTask]:
    f = f or DashFilter()
    now = datetime.now(timezone.utc)
    # Their assigned subtasks, plus subtasks under a task they lead
    assigned_ids = select(SubTaskAssignee.subtask_id).where(SubTaskAssignee.user_id == current_user.id)
    subtask_result = await db.execute(
        select(SubTask)
        .options(selectinload(SubTask.task).selectinload(Task.project))
        .join(Task, Task.id == SubTask.task_id)
        .where(
            or_(SubTask.id.in_(assigned_ids), Task.lead_id == current_user.id),
            *_task_filter_conditions(f, now),
            *_date_conditions(SubTask.due_date, SubTask.status, [TaskStatus.DONE], f, now),
        )
    )
    return list(subtask_result.scalars().all())


async def get_employee_projects(db: AsyncSession, current_user: User) -> list[Project]:
    """Projects the employee has work in (for the Project filter)."""
    result = await db.execute(
        select(Project)
        .where(Project.id.in_(select(Task.project_id).where(_employee_task_condition(current_user))))
        .order_by(Project.name)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Manager data: department scope + led projects
# ---------------------------------------------------------------------------
def _manager_task_candidates(user: User):
    """
    SQL pre-filter: a SUPERSET of the tasks can_view_task() allows, so the
    database skips everything the person could never see.
    """
    scope = project_scope(user)
    if scope is None:
        return true()  # global project view: every task is a candidate
    team_task_ids = select(TaskTeam.task_id).where(TaskTeam.user_id == user.id)
    led_project_ids = select(Project.id).where(Project.lead_id == user.id)
    conds = [
        Task.lead_id == user.id,
        Task.assigned_to == user.id,
        Task.created_by == user.id,
        Task.id.in_(team_task_ids),
        Task.project_id.in_(led_project_ids),
    ]
    if scope:
        conds.append(
            Task.project_id.in_(
                select(project_department.c.project_id).where(project_department.c.department_id.in_(scope))
            )
        )
    return or_(*conds)


async def get_manager_tasks(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> list[Task]:
    f = f or DashFilter()
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.project).selectinload(Project.departments),
            selectinload(Task.creator),
            selectinload(Task.team_members),
        )
        .where(
            _manager_task_candidates(current_user),
            *_task_filter_conditions(f, now),
            *_date_conditions(Task.due_date, Task.status, [TaskStatus.DONE], f, now),
        )
    )
    return [task for task in result.scalars().all() if can_view_task(current_user, task)]


async def get_manager_subtasks(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> list[SubTask]:
    f = f or DashFilter()
    now = datetime.now(timezone.utc)
    assigned_ids = select(SubTaskAssignee.subtask_id).where(SubTaskAssignee.user_id == current_user.id)
    result = await db.execute(
        select(SubTask)
        .options(
            selectinload(SubTask.task).selectinload(Task.project).selectinload(Project.departments),
            selectinload(SubTask.task).selectinload(Task.team_members),
            selectinload(SubTask.assignees),
        )
        .join(Task, Task.id == SubTask.task_id)
        .where(
            or_(_manager_task_candidates(current_user), SubTask.id.in_(assigned_ids)),
            *_task_filter_conditions(f, now),
            *_date_conditions(SubTask.due_date, SubTask.status, [TaskStatus.DONE], f, now),
        )
    )
    return [subtask for subtask in result.scalars().all() if can_view_subtask(current_user, subtask)]


def _manager_project_condition(user: User):
    scope = project_scope(user)
    if scope is None:
        return true()
    conds = [Project.lead_id == user.id]
    if scope:
        conds.append(
            Project.id.in_(
                select(project_department.c.project_id).where(project_department.c.department_id.in_(scope))
            )
        )
    return or_(*conds)


async def get_manager_projects(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> tuple[list[Project], bool]:
    f = f or DashFilter()
    now = datetime.now(timezone.utc)
    conds = [_manager_project_condition(current_user)]
    if f.project_id is not None:
        conds.append(Project.id == f.project_id)
    if f.department_id is not None:
        conds.append(Project.id.in_(_project_ids_in_department(f.department_id)))
    for sub in _org_project_ids(f):
        conds.append(Project.id.in_(sub))
    conds += _date_conditions(Project.due_date, Project.status, list(FINISHED_PROJECT_STATUSES), f, now)
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.departments), selectinload(Project.lead))
        .where(*conds)
        .order_by(Project.name)
    )
    projects = list(result.scalars().all())
    is_global = project_scope(current_user) is None
    if not is_global:
        # The SQL above is department-level; keep only what is in scope AT the right station
        view = has_project_view(current_user)
        projects = [p for p in projects if p.lead_id == current_user.id or (view and project_in_scope(current_user, p))]
    return projects, is_global


# ---------------------------------------------------------------------------
# What each person may filter by (also used to validate the filters)
# ---------------------------------------------------------------------------
async def _filter_options(db: AsyncSession, current_user: User, is_manager: bool) -> dict:
    if is_manager:
        projects, is_global = await get_manager_projects(db, current_user)
        if is_global:
            dept_result = await db.execute(select(Department).order_by(Department.name))
            departments = list(dept_result.scalars().all())
        else:
            scope = project_scope(current_user) or set()
            ids = scope | {d.id for p in projects for d in p.departments}
            departments = []
            if ids:
                dept_result = await db.execute(select(Department).where(Department.id.in_(ids)).order_by(Department.name))
                departments = list(dept_result.scalars().all())
        # Areas / stations / divisions to filter by: everything for a global view,
        # otherwise those of the visible projects and of what the person manages
        if is_global:
            stations = list((await db.execute(select(Station).order_by(Station.name))).scalars().all())
            divisions = list((await db.execute(select(Division).order_by(Division.name))).scalars().all())
        else:
            pairs = get_scope_pairs(current_user) if has_project_view(current_user) else set()
            st_ids = {sid for sid, _ in (pairs or set())} | {st.id for p in projects for st in p.stations}
            stations = list((await db.execute(select(Station).where(Station.id.in_(st_ids)).order_by(Station.name))).scalars().all()) if st_ids else []
            dv = {dv.id: dv for p in projects for dv in p.divisions}
            divisions = sorted(dv.values(), key=lambda x: x.name)
        area_ids = {st.area_id for st in stations}
        areas = list((await db.execute(select(Area).where(Area.id.in_(area_ids)).order_by(Area.name))).scalars().all()) if area_ids else []
        return {
            "user_type": "manager",
            "areas": [{"id": a.id, "name": a.name} for a in areas],
            "stations": [{"id": st.id, "name": st.name, "code": st.code, "area_id": st.area_id} for st in stations],
            "divisions": [{"id": dv.id, "name": dv.name} for dv in divisions],
            "departments": [{"id": d.id, "name": d.name} for d in departments],
            "projects": [
                {"id": p.id, "name": p.name, "department_ids": [d.id for d in p.departments],
                 "station_ids": [st.id for st in p.stations], "division_ids": [dv.id for dv in p.divisions]}
                for p in projects
            ],
        }
    projects = await get_employee_projects(db, current_user)
    return {
        "user_type": "employee",
        "areas": [], "stations": [], "divisions": [],
        "departments": [],
        "projects": [{"id": p.id, "name": p.name, "department_ids": []} for p in projects],
    }


async def _validate_filter(db: AsyncSession, current_user: User, is_manager: bool, f: DashFilter) -> None:
    """Refuse a department or project the person cannot see on their dashboard."""
    if not f.narrows_projects:
        return
    options = await _filter_options(db, current_user, is_manager)
    if f.department_id is not None and f.department_id not in {d["id"] for d in options["departments"]}:
        raise HTTPException(status_code=403, detail="Not allowed: that department is outside your dashboard view")
    for key, val, label in (("areas", f.area_id, "area"), ("stations", f.station_id, "station"), ("divisions", f.division_id, "division")):
        if val is not None and val not in {x["id"] for x in options[key]}:
            raise HTTPException(status_code=403, detail=f"Not allowed: that {label} is outside your dashboard view")
    if f.project_id is not None and f.project_id not in {p["id"] for p in options["projects"]}:
        raise HTTPException(status_code=403, detail="Not allowed: that project is outside your dashboard view")


@router.get("/filter-options")
async def get_filter_options(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Departments and projects this person may filter their dashboard by."""
    is_manager = await user_is_manager(db, current_user)
    return await _filter_options(db, current_user, is_manager)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
@router.get("/summary")
async def get_summary(
    f: DashFilter = Depends(dash_filter),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    await _validate_filter(db, current_user, is_manager, f)

    if is_manager:
        return await get_manager_dashboard(db, current_user, f)
    else:
        return await get_employee_dashboard(db, current_user, f)


def _upcoming(tasks: list[Task], subtasks: list[SubTask]) -> list[dict]:
    upcoming = []
    for task in tasks:
        if task.status != TaskStatus.DONE and task.due_date:
            upcoming.append({
                "type": "task",
                "id": task.id,
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "status": task.status.value if hasattr(task.status, "value") else str(task.status),
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
                "status": subtask.status.value if hasattr(subtask.status, "value") else str(subtask.status),
                "task_id": subtask.task_id,
                "task_title": subtask.task.title if subtask.task else None,
            })
    # Sort by due_date ascending, top 10
    upcoming.sort(key=lambda x: x["due_date"])
    return upcoming[:10]


def _status_counts(items, statuses) -> dict:
    # Always include every status, even with 0 count
    counts = {s.value: 0 for s in statuses}
    for item in items:
        counts[item.status.value] += 1
    return counts


async def get_employee_dashboard(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> dict:
    """Dashboard for regular employees - their own tasks (assigned, led, team) and subtasks."""
    tasks = await get_employee_tasks(db, current_user, f)
    subtasks = await get_employee_subtasks(db, current_user, f)

    now = datetime.now(timezone.utc)
    overdue_tasks = compute_overdue_tasks(tasks, now)
    overdue_subtasks = compute_overdue_subtasks(subtasks, now)

    return {
        "user_type": "employee",
        "tasks": {
            "by_status": _status_counts(tasks, TaskStatus),
            "total": len(tasks),
        },
        "subtasks": {
            "by_status": _status_counts(subtasks, TaskStatus),
            "total": len(subtasks),
        },
        "upcoming_due": _upcoming(tasks, subtasks),
        "overdue_tasks": overdue_tasks[:4],
        "overdue_tasks_total": len(overdue_tasks),
        "overdue_subtasks": overdue_subtasks[:4],
        "overdue_subtasks_total": len(overdue_subtasks),
    }


async def get_manager_dashboard(db: AsyncSession, current_user: User, f: DashFilter | None = None) -> dict:
    """Dashboard for project:view / project:manage holders and project leads - scoped to their departments."""
    scoped_tasks = await get_manager_tasks(db, current_user, f)
    scoped_subtasks = await get_manager_subtasks(db, current_user, f)
    scoped_projects, is_global = await get_manager_projects(db, current_user, f)

    now = datetime.now(timezone.utc)
    overdue_tasks = compute_overdue_tasks(scoped_tasks, now)
    overdue_subtasks = compute_overdue_subtasks(scoped_subtasks, now)
    overdue_projects = compute_overdue_projects(scoped_projects, now)

    return {
        "user_type": "manager",
        "scope": "global" if is_global else "department",
        "tasks": {
            "by_status": _status_counts(scoped_tasks, TaskStatus),
            "total": len(scoped_tasks),
        },
        "subtasks": {
            "by_status": _status_counts(scoped_subtasks, TaskStatus),
            "total": len(scoped_subtasks),
        },
        "projects": {
            "by_status": _status_counts(scoped_projects, ProjectStatus),
            "total": len(scoped_projects),
        },
        "upcoming_due": _upcoming(scoped_tasks, scoped_subtasks),
        "overdue_tasks": overdue_tasks[:4],
        "overdue_tasks_total": len(overdue_tasks),
        "overdue_subtasks": overdue_subtasks[:4],
        "overdue_subtasks_total": len(overdue_subtasks),
        "overdue_projects": overdue_projects[:4],
        "overdue_projects_total": len(overdue_projects),
    }


# ---------------------------------------------------------------------------
# "View all" overdue lists (same filters → same numbers as the dashboard)
# ---------------------------------------------------------------------------
@router.get("/overdue/tasks")
async def get_overdue_tasks(
    f: DashFilter = Depends(dash_filter),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    await _validate_filter(db, current_user, is_manager, f)
    if is_manager:
        tasks = await get_manager_tasks(db, current_user, f)
    else:
        tasks = await get_employee_tasks(db, current_user, f)

    now = datetime.now(timezone.utc)
    overdue_tasks = compute_overdue_tasks(tasks, now)
    return overdue_tasks[:200]


@router.get("/overdue/subtasks")
async def get_overdue_subtasks(
    f: DashFilter = Depends(dash_filter),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    await _validate_filter(db, current_user, is_manager, f)
    if is_manager:
        subtasks = await get_manager_subtasks(db, current_user, f)
    else:
        subtasks = await get_employee_subtasks(db, current_user, f)

    now = datetime.now(timezone.utc)
    overdue_subtasks = compute_overdue_subtasks(subtasks, now)
    return overdue_subtasks[:200]


@router.get("/overdue/projects")
async def get_overdue_projects(
    f: DashFilter = Depends(dash_filter),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = await user_is_manager(db, current_user)
    if not is_manager:
        raise HTTPException(status_code=403, detail="Manager permission required")
    await _validate_filter(db, current_user, is_manager, f)

    projects, _ = await get_manager_projects(db, current_user, f)
    now = datetime.now(timezone.utc)
    overdue_projects = compute_overdue_projects(projects, now)
    return overdue_projects[:200]
