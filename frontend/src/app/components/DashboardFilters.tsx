import React, { useEffect, useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCachedQuery, qk, FRESH } from "../api/queries";
import { getDashboardFilterOptions, DashboardFilterOptions, DashboardParams } from "../api/dashboard";

/**
 * Dashboard filters: [Area] [Station] [Division] [Department] [Project] [Time period] [Clear]
 * (Area / Station / Division appear only when the person has more than one to choose from.)
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
  areaId: number | null;
  stationId: number | null;
  divisionId: number | null;
  departmentId: number | null;
  projectId: number | null;
  period: Period;
  from: string; // YYYY-MM-DD (custom only)
  to: string;   // YYYY-MM-DD (custom only)
}

const DEFAULT_FILTERS: DashFilters = { areaId: null, stationId: null, divisionId: null, departmentId: null, projectId: null, period: "all", from: "", to: "" };

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
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
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
  if (f.areaId != null) params.area_id = f.areaId;
  if (f.stationId != null) params.station_id = f.stationId;
  if (f.divisionId != null) params.division_id = f.divisionId;
  if (f.departmentId != null) params.department_id = f.departmentId;
  if (f.projectId != null) params.project_id = f.projectId;
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
  return f.areaId != null || f.stationId != null || f.divisionId != null || f.departmentId != null || f.projectId != null || f.period !== "all";
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
    let next = filters;
    if (next.departmentId != null && !options.departments.some((d) => d.id === next.departmentId)) {
      next = { ...next, departmentId: null };
    }
    if (next.projectId != null && !options.projects.some((p) => p.id === next.projectId)) {
      next = { ...next, projectId: null };
    }
    if (next.areaId != null && !(options.areas ?? []).some((a) => a.id === next.areaId)) next = { ...next, areaId: null };
    if (next.stationId != null && !(options.stations ?? []).some((s) => s.id === next.stationId)) next = { ...next, stationId: null };
    if (next.divisionId != null && !(options.divisions ?? []).some((d) => d.id === next.divisionId)) next = { ...next, divisionId: null };
    if (next !== filters) setFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Don't send filters until we know they are allowed (prevents a 403 flash)
  const ready = options !== null || (filters.departmentId == null && filters.projectId == null
    && filters.areaId == null && filters.stationId == null && filters.divisionId == null);
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
  const stationChoices = filters.areaId == null ? stations : stations.filter((s) => s.area_id === filters.areaId);

  // Project list follows the chosen area / station / division / department
  const fits = (p: DashboardFilterOptions["projects"][number], f: DashFilters) =>
    (f.departmentId == null || p.department_ids.includes(f.departmentId)) &&
    (f.stationId == null || (p.station_ids ?? []).includes(f.stationId)) &&
    (f.areaId == null || (p.station_ids ?? []).some((s) => stationArea.get(s) === f.areaId)) &&
    (f.divisionId == null || (p.division_ids ?? []).includes(f.divisionId));
  const projectChoices = options.projects.filter((p) => fits(p, filters));

  // keep the chosen project only if it still fits the other filters
  function change(next: DashFilters) {
    const keep = next.projectId != null && options!.projects.some((p) => p.id === next.projectId && fits(p, next));
    setFilters({ ...next, projectId: keep ? next.projectId : null });
  }
  function changeDepartment(value: string) {
    change({ ...filters, departmentId: value ? Number(value) : null });
  }

  return (
    <section aria-label="Filters" className="rlk-panel rlk-filters" data-testid="dashboard-filters">
      <div className="rlk-filters__label">
        <Filter size={14} />
        Filters
      </div>

      {isManager && areas.length > 1 && (
        <label className="rlk-filters__field">
          <span>Area</span>
          <select aria-label="Area filter" value={filters.areaId ?? ""}
            onChange={(e) => { const areaId = e.target.value ? Number(e.target.value) : null;
              const keepSt = filters.stationId != null && (areaId == null || stationArea.get(filters.stationId) === areaId);
              change({ ...filters, areaId, stationId: keepSt ? filters.stationId : null }); }}>
            <option value="">All areas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}

      {isManager && stations.length > 1 && (
        <label className="rlk-filters__field">
          <span>Station</span>
          <select aria-label="Station filter" value={filters.stationId ?? ""}
            onChange={(e) => change({ ...filters, stationId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">All stations</option>
            {stationChoices.map((s) => <option key={s.id} value={s.id}>{s.code || s.name}</option>)}
          </select>
        </label>
      )}

      {isManager && divisions.length > 0 && (
        <label className="rlk-filters__field">
          <span>Division</span>
          <select aria-label="Division filter" value={filters.divisionId ?? ""}
            onChange={(e) => change({ ...filters, divisionId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">All divisions</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}

      {isManager && (
        <label className="rlk-filters__field rlk-filters__dept">
          <span>Department</span>
          <select
            aria-label="Department filter"
            
            value={filters.departmentId ?? ""}
            onChange={(e) => changeDepartment(e.target.value)}
          >
            <option value="">All my departments</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="rlk-filters__field rlk-filters__proj">
        <span>Project</span>
        <select
          aria-label="Project filter"
          
          value={filters.projectId ?? ""}
          onChange={(e) => setFilters({ ...filters, projectId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">All projects</option>
          {projectChoices.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

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
    </section>
  );
}

export { DEFAULT_FILTERS };
