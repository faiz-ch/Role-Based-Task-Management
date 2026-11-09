import React, { useEffect, useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCachedQuery, qk, FRESH } from "../api/queries";
import { getDashboardFilterOptions, DashboardFilterOptions, DashboardParams } from "../api/dashboard";
import { MultiSelect, FilterChips, idsToValues, valuesToIds } from "./MultiSelect";

/**
 * Dashboard filters: [Area] [Station] [Division] [Department] [Project] [Time period] [Clear]
 * (Area / Station / Division appear only when the person has more than one to choose from.)
 * Area, Station, Division, Department and Project are searchable and allow several choices
 * (any of the chosen matches); different filters combine. Time period is a single choice.
 *
 * - Options come from GET /dashboard/filter-options, so each person only sees
 *   departments / projects they are already allowed to see. The server also
 *   re-checks every filter, so filters can only NARROW the dashboard.
 * - The choice is remembered per person in this browser (and shared with the
 *   "View all" overdue pages, so their numbers match the dashboard).
 * - "This week" / "This month" are worked out in the person's LOCAL time here
 *   and sent as exact date-times.
 */

export type Period = "all" | "week" | "month" | "overdue" | "custom";

export interface DashFilters {
  areaIds: number[];
  stationIds: number[];
  divisionIds: number[];
  departmentIds: number[];
  projectIds: number[];
  period: Period;
  from: string; // YYYY-MM-DD (custom only)
  to: string;   // YYYY-MM-DD (custom only)
}

const DEFAULT_FILTERS: DashFilters = { areaIds: [], stationIds: [], divisionIds: [], departmentIds: [], projectIds: [], period: "all", from: "", to: "" };

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "week", label: "Due this week" },
  { value: "month", label: "Due this month" },
  { value: "overdue", label: "Overdue only" },
  { value: "custom", label: "Custom dates" },
];

function storageKey(userId: number | undefined) {
  return `dashboardFilters:${userId ?? "anon"}`;
}

function readStored(userId: number | undefined): DashFilters {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_FILTERS;
    const v = JSON.parse(raw) || {};
    // older saved choice (one of each) → lists
    const list = (many: unknown, one: unknown) =>
      Array.isArray(many) ? many.filter((x) => typeof x === "number") : typeof one === "number" ? [one] : [];
    return {
      areaIds: list(v.areaIds, v.areaId), stationIds: list(v.stationIds, v.stationId), divisionIds: list(v.divisionIds, v.divisionId),
      departmentIds: list(v.departmentIds, v.departmentId), projectIds: list(v.projectIds, v.projectId),
      period: PERIOD_OPTIONS.some((o) => o.value === v.period) ? v.period : "all",
      from: typeof v.from === "string" ? v.from : "", to: typeof v.to === "string" ? v.to : "",
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function writeStored(userId: number | undefined, filters: DashFilters) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(filters));
  } catch {
    /* storage unavailable (private window etc.) — filters still work for this visit */
  }
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function parseDay(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Turn the UI choice into the query the server understands. */
export function filtersToParams(f: DashFilters): DashboardParams {
  const params: DashboardParams = {};
  if (f.areaIds.length) params.area_id = f.areaIds;
  if (f.stationIds.length) params.station_id = f.stationIds;
  if (f.divisionIds.length) params.division_id = f.divisionIds;
  if (f.departmentIds.length) params.department_id = f.departmentIds;
  if (f.projectIds.length) params.project_id = f.projectIds;
  const today = new Date();
  if (f.period === "week") {
    const mondayOffset = (today.getDay() + 6) % 7; // Monday = start of week
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    params.due_from = startOfDay(monday).toISOString();
    params.due_to = endOfDay(sunday).toISOString();
  } else if (f.period === "month") {
    params.due_from = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)).toISOString();
    params.due_to = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)).toISOString();
  } else if (f.period === "overdue") {
    params.overdue = true;
  } else if (f.period === "custom") {
    const from = parseDay(f.from);
    const to = parseDay(f.to);
    if (from) params.due_from = startOfDay(from).toISOString();
    if (to) params.due_to = endOfDay(to).toISOString();
  }
  return params;
}

export function isFiltered(f: DashFilters): boolean {
  return f.areaIds.length > 0 || f.stationIds.length > 0 || f.divisionIds.length > 0 || f.departmentIds.length > 0 || f.projectIds.length > 0 || f.period !== "all";
}

/**
 * Shared filter state for the dashboard and its "View all" pages.
 * Returns the filters, a setter, the server params and the allowed options.
 */
export function useDashboardFilters() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const [filters, setFiltersState] = useState<DashFilters>(() => readStored(userId));

  // Another person logged in on this browser → load their own saved filters
  useEffect(() => {
    setFiltersState(readStored(userId));
  }, [userId]);

  const optionsQ = useCachedQuery<DashboardFilterOptions | null>(
    qk.dashboardFilterOptions, getDashboardFilterOptions, null, { staleTime: FRESH.NORMAL }
  );
  const options = optionsQ.data;

  function setFilters(next: DashFilters) {
    setFiltersState(next);
    writeStored(userId, next);
  }

  // Drop a saved department / project the person can no longer see (avoids "Not allowed")
  useEffect(() => {
    if (!options) return;
    const keep = (ids: number[], list: { id: number }[] | undefined) => {
      const ok = new Set((list ?? []).map((x) => x.id));
      return ids.filter((id) => ok.has(id));
    };
    const next: DashFilters = {
      ...filters,
      departmentIds: keep(filters.departmentIds, options.departments),
      projectIds: keep(filters.projectIds, options.projects),
      areaIds: keep(filters.areaIds, options.areas),
      stationIds: keep(filters.stationIds, options.stations),
      divisionIds: keep(filters.divisionIds, options.divisions),
    };
    const same = (["departmentIds", "projectIds", "areaIds", "stationIds", "divisionIds"] as const)
      .every((k) => next[k].length === filters[k].length);
    if (!same) setFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Don't send filters until we know they are allowed (prevents a 403 flash)
  const ready = options !== null || (filters.departmentIds.length === 0 && filters.projectIds.length === 0
    && filters.areaIds.length === 0 && filters.stationIds.length === 0 && filters.divisionIds.length === 0);
  const params = useMemo(() => filtersToParams(filters), [filters]);

  return { filters, setFilters, params, options, ready, isFiltered: isFiltered(filters) };
}

export function DashboardFilters({
  filters,
  setFilters,
  options,
  updating = false,
}: {
  filters: DashFilters;
  setFilters: (f: DashFilters) => void;
  options: DashboardFilterOptions | null;
  updating?: boolean;
}) {
  if (!options) return null;
  const isManager = options.user_type === "manager";

  const areas = options.areas ?? [], stations = options.stations ?? [], divisions = options.divisions ?? [];
  const stationArea = new Map(stations.map((s) => [s.id, s.area_id]));
  const stationChoices = filters.areaIds.length === 0 ? stations : stations.filter((s) => filters.areaIds.includes(s.area_id));
  const has = (list: number[], id: number) => list.length === 0 || list.includes(id);

  // Project list follows the chosen areas / stations / divisions / departments
  const fits = (p: DashboardFilterOptions["projects"][number], f: DashFilters) =>
    (f.departmentIds.length === 0 || p.department_ids.some((d) => f.departmentIds.includes(d))) &&
    (f.stationIds.length === 0 || (p.station_ids ?? []).some((s) => f.stationIds.includes(s))) &&
    (f.areaIds.length === 0 || (p.station_ids ?? []).some((s) => has(f.areaIds, stationArea.get(s) ?? -1))) &&
    (f.divisionIds.length === 0 || (p.division_ids ?? []).some((d) => f.divisionIds.includes(d)));
  const projectChoices = options.projects.filter((p) => fits(p, filters));

  // keep only chosen projects that still fit the other filters
  function change(next: DashFilters) {
    setFilters({ ...next, projectIds: next.projectIds.filter((id) => options!.projects.some((p) => p.id === id && fits(p, next))) });
  }
  function changeAreas(areaIds: number[]) {
    // drop stations outside the chosen areas
    const stationIds = areaIds.length === 0 ? filters.stationIds : filters.stationIds.filter((sid) => areaIds.includes(stationArea.get(sid) ?? -1));
    change({ ...filters, areaIds, stationIds });
  }

  const name = (list: { id: number; name: string; code?: string | null }[], id: number) => {
    const x = list.find((i) => i.id === id);
    return x ? (x.code || x.name) : String(id);
  };
  const chips = [
    ...filters.areaIds.map((id) => ({ key: `a${id}`, label: name(areas, id), onRemove: () => changeAreas(filters.areaIds.filter((x) => x !== id)) })),
    ...filters.stationIds.map((id) => ({ key: `s${id}`, label: name(stations, id), onRemove: () => change({ ...filters, stationIds: filters.stationIds.filter((x) => x !== id) }) })),
    ...filters.divisionIds.map((id) => ({ key: `v${id}`, label: name(divisions, id), onRemove: () => change({ ...filters, divisionIds: filters.divisionIds.filter((x) => x !== id) }) })),
    ...filters.departmentIds.map((id) => ({ key: `d${id}`, label: name(options.departments, id), onRemove: () => change({ ...filters, departmentIds: filters.departmentIds.filter((x) => x !== id) }) })),
    ...filters.projectIds.map((id) => ({ key: `p${id}`, label: name(options.projects, id), onRemove: () => setFilters({ ...filters, projectIds: filters.projectIds.filter((x) => x !== id) }) })),
  ];

  return (
    <section aria-label="Filters" className="rlk-panel rlk-filters" data-testid="dashboard-filters">
      <div className="rlk-filters__label">
        <Filter size={14} />
        Filters
      </div>

      {isManager && areas.length > 1 && (
        <div className="rlk-filters__field">
          <span>Area</span>
          <MultiSelect label="Area filter" placeholder="All areas" noun="areas"
            options={areas.map((a) => ({ value: String(a.id), label: a.name }))}
            values={idsToValues(filters.areaIds)} onChange={(v) => changeAreas(valuesToIds(v))} />
        </div>
      )}

      {isManager && stations.length > 1 && (
        <div className="rlk-filters__field">
          <span>Station</span>
          <MultiSelect label="Station filter" placeholder="All stations" noun="stations"
            options={stationChoices.map((s) => ({ value: String(s.id), label: s.code || s.name, hint: s.code ? s.name : null }))}
            values={idsToValues(filters.stationIds)} onChange={(v) => change({ ...filters, stationIds: valuesToIds(v) })} />
        </div>
      )}

      {isManager && divisions.length > 0 && (
        <div className="rlk-filters__field">
          <span>Division</span>
          <MultiSelect label="Division filter" placeholder="All divisions" noun="divisions"
            options={divisions.map((d) => ({ value: String(d.id), label: d.name }))}
            values={idsToValues(filters.divisionIds)} onChange={(v) => change({ ...filters, divisionIds: valuesToIds(v) })} />
        </div>
      )}

      {isManager && (
        <div className="rlk-filters__field rlk-filters__dept">
          <span>Department</span>
          <MultiSelect label="Department filter" placeholder="All my departments" noun="departments"
            options={options.departments.map((d) => ({ value: String(d.id), label: d.name }))}
            values={idsToValues(filters.departmentIds)} onChange={(v) => change({ ...filters, departmentIds: valuesToIds(v) })} />
        </div>
      )}

      <div className="rlk-filters__field rlk-filters__proj">
        <span>Project</span>
        <MultiSelect label="Project filter" placeholder="All projects" noun="projects"
          options={projectChoices.map((p) => ({ value: String(p.id), label: p.name }))}
          values={idsToValues(filters.projectIds)} onChange={(v) => setFilters({ ...filters, projectIds: valuesToIds(v) })} />
      </div>

      <label className="rlk-filters__field rlk-filters__time">
        <span>Time period</span>
        <select
          aria-label="Time period filter"
          
          value={filters.period}
          onChange={(e) => setFilters({ ...filters, period: e.target.value as Period })}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      {filters.period === "custom" && (
        <>
          <label className="rlk-filters__field">
            <span>From</span>
            <input
              type="date"
              aria-label="From date"
              
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label className="rlk-filters__field">
            <span>To</span>
            <input
              type="date"
              aria-label="To date"
              
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
        </>
      )}

      {isFiltered(filters) && (
        <button
          onClick={() => setFilters(DEFAULT_FILTERS)}
          className="rlk-filters__clear"
        >
          <X size={14} />
          Clear
        </button>
      )}

      {updating && <span className="rlk-filters__busy">Updating…</span>}

      <FilterChips chips={chips} />
    </section>
  );
}

export { DEFAULT_FILTERS };
