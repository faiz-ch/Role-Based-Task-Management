"""
Organisation structure: Areas, Stations and Divisions (Departments live in
routers/departments.py and are linked to Stations).

Everyone who is signed in can READ these lists (they fill dropdowns).
Changing them needs the "organization:manage" permission. The structure is
organisation-wide: it is not limited by the departments a person manages.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_permission, get_current_user
from app.database import get_db
from app.models.department import Department
from app.models.organization import Area, Station, Division
from app.models.user import User
from app.schemas.organization import (
    AreaCreate, AreaUpdate, AreaOut,
    StationCreate, StationUpdate, StationOut,
    DivisionCreate, DivisionUpdate, DivisionOut,
)
from app.services.activity_log import log_activity

router = APIRouter(tags=["organization"])
MANAGE = "organization:manage"


async def _ensure_unique(db: AsyncSession, model, field: str, value, exclude_id: int | None, label: str):
    if value is None:
        return
    q = select(model.id).where(getattr(model, field).ilike(value) if isinstance(value, str) else getattr(model, field) == value)
    if exclude_id is not None:
        q = q.where(model.id != exclude_id)
    if (await db.execute(q)).first() is not None:
        raise HTTPException(status_code=400, detail=f"{label} '{value}' already exists")


def _ref(obj) -> dict:
    return {"id": obj.id, "name": obj.name, "code": getattr(obj, "code", None)}


# =========================================================================== Areas
def _area_out(area: Area) -> AreaOut:
    return AreaOut(
        id=area.id, name=area.name, code=area.code, description=area.description, is_active=area.is_active,
        station_count=len(area.stations), stations=[_ref(s) for s in area.stations], created_at=area.created_at,
    )


async def _get_area(db: AsyncSession, area_id: int) -> Area:
    area = (await db.execute(
        select(Area).options(selectinload(Area.stations)).where(Area.id == area_id).execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if area is None:
        raise HTTPException(status_code=404, detail="Area not found")
    return area


@router.get("/areas", response_model=list[AreaOut])
async def list_areas(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    areas = (await db.execute(select(Area).options(selectinload(Area.stations)).order_by(Area.name))).scalars().all()
    return [_area_out(a) for a in areas]


@router.get("/areas/{area_id}", response_model=AreaOut)
async def get_area(area_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return _area_out(await _get_area(db, area_id))


@router.post("/areas", response_model=AreaOut, status_code=201)
async def create_area(payload: AreaCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    await _ensure_unique(db, Area, "name", payload.name, None, "Area")
    await _ensure_unique(db, Area, "code", payload.code, None, "Area code")
    area = Area(name=payload.name, code=payload.code, description=payload.description, is_active=payload.is_active)
    db.add(area)
    await db.flush()
    await log_activity(db, user.id, "area_created", "area", area.id, detail=f"Created area '{area.name}'")
    await db.commit()
    return _area_out(await _get_area(db, area.id))


@router.patch("/areas/{area_id}", response_model=AreaOut)
async def update_area(area_id: int, payload: AreaUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    area = await _get_area(db, area_id)
    sent = payload.model_fields_set
    if "name" in sent and payload.name:
        await _ensure_unique(db, Area, "name", payload.name, area_id, "Area")
        area.name = payload.name
    if "code" in sent:
        await _ensure_unique(db, Area, "code", payload.code, area_id, "Area code")
        area.code = payload.code
    if "description" in sent:
        area.description = payload.description
    if payload.is_active is not None:
        area.is_active = payload.is_active
    await log_activity(db, user.id, "area_updated", "area", area.id, detail=f"Updated area '{area.name}'")
    await db.commit()
    return _area_out(await _get_area(db, area_id))


async def _people_count(db: AsyncSession, *conds) -> int:
    from sqlalchemy import func as _f
    return (await db.execute(select(_f.count(User.id)).where(*conds))).scalar() or 0


@router.delete("/areas/{area_id}", status_code=204)
async def delete_area(area_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    area = await _get_area(db, area_id)
    if area.stations:
        raise HTTPException(
            status_code=400,
            detail=f"'{area.name}' still has {len(area.stations)} station(s). Move them to another area or delete them first.",
        )
    name = area.name
    await db.delete(area)
    await log_activity(db, user.id, "area_deleted", "area", area_id, detail=f"Deleted area '{name}'")
    await db.commit()


# =========================================================================== Stations
def _station_out(st: Station) -> StationOut:
    return StationOut(
        id=st.id, name=st.name, code=st.code, description=st.description, is_active=st.is_active,
        area=_ref(st.area), departments=[_ref(d) for d in st.departments], created_at=st.created_at,
    )


def _station_query():
    return select(Station).options(selectinload(Station.area), selectinload(Station.departments))


async def _get_station(db: AsyncSession, station_id: int) -> Station:
    st = (await db.execute(
        _station_query().where(Station.id == station_id).execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return st


async def _load_area(db: AsyncSession, area_id: int) -> Area:
    area = await db.get(Area, area_id)
    if area is None:
        raise HTTPException(status_code=400, detail="Choose an existing area for this station")
    return area


async def _load_departments(db: AsyncSession, ids: list[int]) -> list[Department]:
    ids = list(dict.fromkeys(ids or []))
    if not ids:
        return []
    found = (await db.execute(select(Department).where(Department.id.in_(ids)))).scalars().all()
    if len(found) != len(ids):
        raise HTTPException(status_code=400, detail="One or more departments do not exist")
    return list(found)


@router.get("/stations", response_model=list[StationOut])
async def list_stations(area_id: int | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = _station_query().order_by(Station.name)
    if area_id is not None:
        q = q.where(Station.area_id == area_id)
    return [_station_out(s) for s in (await db.execute(q)).scalars().all()]


@router.get("/stations/{station_id}", response_model=StationOut)
async def get_station(station_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return _station_out(await _get_station(db, station_id))


@router.post("/stations", response_model=StationOut, status_code=201)
async def create_station(payload: StationCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    await _ensure_unique(db, Station, "name", payload.name, None, "Station")
    await _ensure_unique(db, Station, "code", payload.code, None, "Station code")
    await _load_area(db, payload.area_id)
    st = Station(name=payload.name, code=payload.code, description=payload.description,
                 area_id=payload.area_id, is_active=payload.is_active)
    st.departments = await _load_departments(db, payload.department_ids)
    db.add(st)
    await db.flush()
    await log_activity(db, user.id, "station_created", "station", st.id, detail=f"Created station '{st.name}'")
    await db.commit()
    return _station_out(await _get_station(db, st.id))


@router.patch("/stations/{station_id}", response_model=StationOut)
async def update_station(station_id: int, payload: StationUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    st = await _get_station(db, station_id)
    sent = payload.model_fields_set
    if "name" in sent and payload.name:
        await _ensure_unique(db, Station, "name", payload.name, station_id, "Station")
        st.name = payload.name
    if "code" in sent:
        await _ensure_unique(db, Station, "code", payload.code, station_id, "Station code")
        st.code = payload.code
    if "description" in sent:
        st.description = payload.description
    if payload.area_id is not None and payload.area_id != st.area_id:
        await _load_area(db, payload.area_id)
        st.area_id = payload.area_id
        # people who work at this station move with it
        from sqlalchemy import update as _upd
        await db.execute(_upd(User).where(User.station_id == st.id).values(area_id=payload.area_id))
    if payload.department_ids is not None:
        new_depts = await _load_departments(db, payload.department_ids)
        removed = [d for d in st.departments if d.id not in {x.id for x in new_depts}]
        for d in removed:
            n = await _people_count(db, User.station_id == st.id, User.department_id == d.id)
            if n:
                raise HTTPException(
                    status_code=400,
                    detail=f"{n} person(s) work in '{d.name}' at '{st.name}'. Move them to another department first.",
                )
        st.departments = new_depts
    if payload.is_active is not None:
        st.is_active = payload.is_active
    await log_activity(db, user.id, "station_updated", "station", st.id, detail=f"Updated station '{st.name}'")
    await db.commit()
    return _station_out(await _get_station(db, station_id))


@router.delete("/stations/{station_id}", status_code=204)
async def delete_station(station_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    st = await _get_station(db, station_id)
    n = await _people_count(db, User.station_id == st.id)
    if n:
        raise HTTPException(status_code=400, detail=f"{n} person(s) work at '{st.name}'. Move them to another station first.")
    name = st.name
    await db.delete(st)  # its department links are removed by the database
    await log_activity(db, user.id, "station_deleted", "station", station_id, detail=f"Deleted station '{name}'")
    await db.commit()


# =========================================================================== Divisions
@router.get("/divisions", response_model=list[DivisionOut])
async def list_divisions(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return (await db.execute(select(Division).order_by(Division.name))).scalars().all()


@router.post("/divisions", response_model=DivisionOut, status_code=201)
async def create_division(payload: DivisionCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    await _ensure_unique(db, Division, "name", payload.name, None, "Division")
    div = Division(name=payload.name, description=payload.description, is_active=payload.is_active)
    db.add(div)
    await db.flush()
    await log_activity(db, user.id, "division_created", "division", div.id, detail=f"Created division '{div.name}'")
    await db.commit()
    await db.refresh(div)
    return div


@router.patch("/divisions/{division_id}", response_model=DivisionOut)
async def update_division(division_id: int, payload: DivisionUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    div = await db.get(Division, division_id)
    if div is None:
        raise HTTPException(status_code=404, detail="Division not found")
    sent = payload.model_fields_set
    if "name" in sent and payload.name:
        await _ensure_unique(db, Division, "name", payload.name, division_id, "Division")
        div.name = payload.name
    if "description" in sent:
        div.description = payload.description
    if payload.is_active is not None:
        div.is_active = payload.is_active
    await log_activity(db, user.id, "division_updated", "division", div.id, detail=f"Updated division '{div.name}'")
    await db.commit()
    await db.refresh(div)
    return div


@router.delete("/divisions/{division_id}", status_code=204)
async def delete_division(division_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(MANAGE))):
    div = await db.get(Division, division_id)
    if div is None:
        raise HTTPException(status_code=404, detail="Division not found")
    n = await _people_count(db, User.division_id == div.id)
    if n:
        raise HTTPException(status_code=400, detail=f"{n} person(s) are in '{div.name}'. Change their division first.")
    name = div.name
    await db.delete(div)
    await log_activity(db, user.id, "division_deleted", "division", division_id, detail=f"Deleted division '{name}'")
    await db.commit()
