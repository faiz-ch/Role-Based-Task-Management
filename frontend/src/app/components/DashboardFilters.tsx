import React, { useEffect, useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCachedQuery, qk, FRESH } from "../api/queries";
import { getDashboardFilterOptions, DashboardFilterOptions, DashboardParams } from "../api/dashboard";

/**
 * Dashboard filters: [Department] [Project] [Time period] [Clear]
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
  departmentId: number | null;
  projectId: number | null;
  period: Period;
  from: string; // YYYY-MM-DD (custom only)
  to: string;   // YYYY-MM-DD (custom only)
}

const DEFAULT_FILTERS: DashFilters = { departmentId: null, projectId: null, period: "all", from: "", to: "" };

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
  return f.departmentId != null || f.projectId != null || f.period !== "all";
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
    if (next !== filters) setFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Don't send filters until we know they are allowed (prevents a 403 flash)
  const ready = options !== null || (filters.departmentId == null && filters.projectId == null);
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

  // Project list follows the chosen department
  const projectChoices =
    filters.departmentId == null
      ? options.projects
      : options.projects.filter((p) => p.department_ids.includes(filters.departmentId!));

  function changeDepartment(value: string) {
    const departmentId = value ? Number(value) : null;
    // keep the project only if it belongs to the new department
    const keepProject =
      filters.projectId != null &&
      (departmentId == null ||
        options!.projects.some((p) => p.id === filters.projectId && p.department_ids.includes(departmentId)));
    setFilters({ ...filters, departmentId, projectId: keepProject ? filters.projectId : null });
  }

  return (
    <section aria-label="Filters" className="rlk-panel rlk-filters" data-testid="dashboard-filters">
      <div className="rlk-filters__label">
        <Filter size={14} />
        Filters
      </div>

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
