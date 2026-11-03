import React, { useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Clock,
  Globe,
  Building2,
  ChevronRight,
} from "lucide-react";
import { getDashboardSummary, DashboardSummary } from "../api/dashboard";
import { useCachedQuery, qk, FRESH } from "../api/queries";
import { DashboardFilters, useDashboardFilters } from "../components/DashboardFilters";

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-slate-100 text-slate-700 border-slate-200",
  "Review": "bg-amber-100 text-amber-700 border-amber-200",
  "Done": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Reschedule": "bg-red-100 text-red-700 border-red-200",
};

// Status colours from the RLKG PMS design (hex, used as dot / bar fills)
const STATUS_DOT_COLORS: Record<string, string> = {
  "To Do": "#8B8F98",
  "Review": "#B08C2E",
  "Done": "#2F7D5B",
  "Reschedule": "#B23A2E",
};

const PROJECT_STATUS_DOT_COLORS: Record<string, string> = {
  "Planning": "#8B8F98",
  "Active": "#2F7D5B",
  "Pending Approval": "#B08C2E",
  "Done": "#15171C",
  "Archived": "#C9C3B5",
};

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDueDateColor(dueDate: string): string {
  if (!dueDate) return "text-muted-foreground";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  
  if (diffDays < 0) return "text-red-600 font-semibold";
  if (diffDays <= 2) return "text-amber-600 font-semibold";
  return "text-muted-foreground";
}

export function DashboardPage() {
  // Filters (Department / Project / Time period) — remembered per person
  const dash = useDashboardFilters();

  // Shared store: instant on return, re-checked every 60 s and on tab focus.
  // Each filter combination is cached; the previous numbers stay on screen while new ones load.
  const summaryQ = useCachedQuery<DashboardSummary | null>(
    qk.dashboardSummary(dash.params as Record<string, unknown>),
    () => getDashboardSummary(dash.params),
    null,
    { staleTime: FRESH.LIVE, poll: true, enabled: dash.ready, keepPrevious: true }
  );
  const summary = summaryQ.data;
  const loading = summaryQ.isLoading || (!dash.ready && !summary);
  const error = summaryQ.error ? summaryQ.error.message || "Failed to load dashboard data." : null;
  const navigate = useNavigate();

  const filterBar = (
    <DashboardFilters
      filters={dash.filters}
      setFilters={dash.setFilters}
      options={dash.options}
      updating={summaryQ.isFetching && !summaryQ.isLoading}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rlk-dash">
        {filterBar}
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700 font-semibold">{error}</span>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const isManager = summary.user_type === "manager";

  // Hide the Tasks card/panel only for regular employees with zero tasks
  // (e.g. someone who's only ever a subtask assignee). Managers/admins
  // always see it, even at zero, since it's an oversight view, not a
  // personal assignment list.
  const showTasksCard = isManager || summary.tasks.total > 0;

  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // Total cards, as in the design: coloured code badge, big number, status rows
  const cards: { key: string; label: string; total: number; code: string; fg: string; bg: string; rows: [string, number][]; colors: Record<string, string> }[] = [];
  if (isManager && summary.projects) {
    cards.push({ key: "projects", label: "Total Projects", total: summary.projects.total, code: "PR", fg: "#8A6A1F", bg: "#F4ECD8",
      rows: Object.entries(summary.projects.by_status), colors: PROJECT_STATUS_DOT_COLORS });
  }
  if (showTasksCard) {
    cards.push({ key: "tasks", label: "Total Tasks", total: summary.tasks.total, code: "TK", fg: "#D4B061", bg: "#15171C",
      rows: Object.entries(summary.tasks.by_status), colors: STATUS_DOT_COLORS });
  }
  cards.push({ key: "subtasks", label: "Total Subtasks", total: summary.subtasks.total, code: "ST", fg: "#2F7D5B", bg: "#E3F0E9",
    rows: Object.entries(summary.subtasks.by_status), colors: STATUS_DOT_COLORS });

  const breakdowns: { key: string; title: string; total: number; rows: [string, number][] }[] = [];
  if (showTasksCard) breakdowns.push({ key: "tasks", title: "Tasks by Status", total: summary.tasks.total, rows: Object.entries(summary.tasks.by_status) });
  breakdowns.push({ key: "subtasks", title: "Subtasks by Status", total: summary.subtasks.total, rows: Object.entries(summary.subtasks.by_status) });

  type OverdueRow = { id: number; title: string; sub: string | null | undefined; days: number; to: string };
  const overdueCards: { key: string; title: string; total?: number; viewAll: string; rows: OverdueRow[] }[] = [];
  if (isManager) {
    overdueCards.push({ key: "projects", title: "Projects Overdue", total: summary.overdue_projects_total, viewAll: "/dashboard/overdue/projects",
      rows: (summary.overdue_projects ?? []).map((p) => ({ id: p.id, title: p.title, sub: p.department_name, days: p.days_overdue, to: `/projects/${p.id}` })) });
  }
  if (showTasksCard) {
    overdueCards.push({ key: "tasks", title: "Tasks Overdue", total: summary.overdue_tasks_total, viewAll: "/dashboard/overdue/tasks",
      rows: (summary.overdue_tasks ?? []).map((t) => ({ id: t.id, title: t.title, sub: t.project_name, days: t.days_overdue, to: `/tasks/${t.id}` })) });
  }
  overdueCards.push({ key: "subtasks", title: "Subtasks Overdue", total: summary.overdue_subtasks_total, viewAll: "/dashboard/overdue/subtasks",
    rows: (summary.overdue_subtasks ?? []).map((st) => ({ id: st.id, title: st.title, sub: [st.project_name, st.task_title].filter(Boolean).join(" → "), days: st.days_overdue, to: `/subtasks/${st.id}` })) });

  return (
    <div className="rlk-dash">
      {/* Title */}
      <div className="rlk-dash__head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="rlk-eyebrow">Rashid Latif Khan Group</span>
          <h1 className="rlk-dash__title">Dashboard</h1>
          <p className="rlk-dash__sub">
            {isManager ? "Overview of your department scope" : "Your assigned tasks and subtasks"}
            {dash.isFiltered && " (filtered)"}
          </p>
        </div>
        {isManager && summary.scope && (
          <span className="rlk-scope">
            {summary.scope === "global" ? <Globe size={14} aria-hidden="true" /> : <Building2 size={14} aria-hidden="true" />}
            {summary.scope === "global" ? "Showing: All Departments" : "Showing: Department Scope"}
          </span>
        )}
      </div>

      {filterBar}

      {/* Totals */}
      <section aria-label="Totals" className="rlk-grid rlk-grid--cards">
        {cards.map((c) => (
          <div key={c.key} className="rlk-panel rlk-total">
            <div className="rlk-total__top">
              <div className="rlk-total__code" style={{ background: c.bg, color: c.fg }} aria-hidden="true">{c.code}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span className="rlk-total__label">{c.label}</span>
                <span className="rlk-total__num">{c.total}</span>
              </div>
            </div>
            <div className="rlk-total__rows">
              {c.rows.map(([status, count]) => (
                <div key={status} className="rlk-total__row">
                  <span className="rlk-dotlabel"><span className="rlk-dot" style={{ background: c.colors[status] || "#8B8F98" }} />{status}</span>
                  <span className="rlk-total__n">{count}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Status breakdown */}
      <section aria-label="Status breakdown" className="rlk-grid rlk-grid--bars">
        {breakdowns.map((b) => (
          <div key={b.key} className="rlk-panel rlk-bars">
            <h2 className="rlk-card-title">{b.title}</h2>
            <div className="rlk-bars__head"><span>Status</span><span>Count</span><span>%</span><span /></div>
            {b.rows.map(([status, count]) => {
              const p = pct(count, b.total);
              return (
                <div key={status} className="rlk-bars__row">
                  <span className="rlk-dotlabel"><span className="rlk-dot" style={{ background: STATUS_DOT_COLORS[status] || "#8B8F98" }} />{status}</span>
                  <span className="rlk-bars__n">{count}</span>
                  <span className="rlk-bars__p">{p}%</span>
                  <div className="rlk-track"><div className="rlk-track__fill" style={{ width: `${p}%`, background: STATUS_DOT_COLORS[status] || "#8B8F98" }} /></div>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      {/* Overdue */}
      <section aria-label="Overdue" className="rlk-grid rlk-grid--cards">
        {overdueCards.map((o) => (
          <div key={o.key} className="rlk-panel rlk-overdue">
            <div className="rlk-overdue__head">
              <h2 className="rlk-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={17} color="#B23A2E" aria-hidden="true" />
                {o.title}
                {o.total !== undefined && o.total > 0 && <span className="rlk-count">{o.total}</span>}
              </h2>
              <button type="button" className="rlk-viewall" onClick={() => navigate(o.viewAll)}>View all →</button>
            </div>
            {o.rows.length === 0 ? (
              <p className="rlk-empty">Nothing overdue</p>
            ) : (
              <div>
                {o.rows.map((r) => (
                  <button type="button" key={r.id} className="rlk-overdue__row" onClick={() => navigate(r.to)}>
                    <span style={{ minWidth: 0, display: "flex", flexDirection: "column", textAlign: "left" }}>
                      <span className="rlk-overdue__title">{r.title}</span>
                      {r.sub && <span className="rlk-overdue__sub">{r.sub}</span>}
                    </span>
                    <span className="rlk-overdue__days">
                      {r.days} {r.days === 1 ? "day" : "days"} overdue
                      <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Upcoming due (kept from the existing dashboard) */}
      <section className="rlk-panel" aria-label="Upcoming due" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rlk-track)" }}>
          <h2 className="rlk-card-title">Upcoming Due</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--rlk-muted)" }}>Items due soon (top 10)</p>
        </div>
        {summary.upcoming_due.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <Clock size={30} className="text-muted-foreground mx-auto mb-2" aria-hidden="true" />
            <p className="rlk-empty" style={{ padding: 0 }}>No upcoming due items</p>
          </div>
        ) : (
          <div>
            {summary.upcoming_due.map((item) => (
              <button
                type="button"
                key={`${item.type}-${item.id}`}
                className="rlk-upcoming"
                onClick={() => navigate(item.type === "task" ? `/tasks/${item.id}` : `/subtasks/${item.id}`)}
              >
                <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className={`rlk-kind ${item.type === "task" ? "rlk-kind--task" : "rlk-kind--sub"}`}>{item.type === "task" ? "Task" : "Subtask"}</span>
                    <span className="rlk-overdue__title">{item.title}</span>
                  </span>
                  <span className="rlk-overdue__sub">
                    {[item.project_name, item.task_title ? `→ ${item.task_title}` : null].filter(Boolean).join(" ")}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span className={`text-xs ${getDueDateColor(item.due_date)}`} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(item.due_date)}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_COLORS[item.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                    {item.status}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
