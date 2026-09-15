import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  CheckSquare,
  Layers,
  FolderKanban,
  AlertTriangle,
  Clock,
  Globe,
  Building2,
  ChevronRight,
} from "lucide-react";
import { getDashboardSummary, DashboardSummary } from "../api/dashboard";

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-slate-100 text-slate-700 border-slate-200",
  "Review": "bg-amber-100 text-amber-700 border-amber-200",
  "Done": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Reschedule": "bg-red-100 text-red-700 border-red-200",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  "To Do": "bg-slate-400",
  "Review": "bg-amber-400",
  "Done": "bg-emerald-400",
  "Reschedule": "bg-red-400",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  "To Do": "bg-slate-400",
  "Review": "bg-amber-400",
  "Done": "bg-emerald-400",
  "Reschedule": "bg-red-400",
};

const PROJECT_STATUS_DOT_COLORS: Record<string, string> = {
  "Planning": "bg-slate-400",
  "Active": "bg-blue-400",
  "Pending Approval": "bg-amber-400",
  "Done": "bg-emerald-400",
  "Archived": "bg-gray-400",
};

function StatusDot({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${colorMap[status] || "bg-gray-400"}`}
    />
  );
}

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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const fetchedSummary = await getDashboardSummary();
        setSummary(fetchedSummary);
      } catch (err: any) {
        setError(err?.message || "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

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
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700 font-semibold">{error}</span>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const isManager = summary.user_type === "manager";

  return (
    <div className="p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Overview of your department scope" : "Your assigned tasks and subtasks"}
          </p>
        </div>
        {isManager && summary.scope && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            {summary.scope === "global" ? (
              <>
                <Globe size={14} className="text-blue-600" />
                <span className="text-xs font-medium text-blue-700">Showing: All Departments</span>
              </>
            ) : (
              <>
                <Building2 size={14} className="text-blue-600" />
                <span className="text-xs font-medium text-blue-700">Showing: Department Scope</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Tasks Card */}
        {summary.tasks.total > 0 && (
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <CheckSquare size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold text-foreground">{summary.tasks.total}</p>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(summary.tasks.by_status).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <StatusDot status={status} colorMap={STATUS_DOT_COLORS} />
                    {status}
                  </span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subtasks Card */}
        <div className={`bg-white rounded-xl border border-border p-5 shadow-sm ${summary.tasks.total === 0 && !isManager ? "md:col-span-2 lg:col-span-3" : ""}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Layers size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Subtasks</p>
              <p className="text-2xl font-bold text-foreground">{summary.subtasks.total}</p>
            </div>
          </div>
          <div className="space-y-2">
            {Object.entries(summary.subtasks.by_status).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <StatusDot status={status} colorMap={STATUS_DOT_COLORS} />
                  {status}
                </span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Projects Card (Manager Only) */}
        {isManager && summary.projects && (
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <FolderKanban size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Projects</p>
                <p className="text-2xl font-bold text-foreground">{summary.projects.total}</p>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(summary.projects.by_status).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <StatusDot status={status} colorMap={PROJECT_STATUS_DOT_COLORS} />
                    {status}
                  </span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tasks Status Breakdown */}
        {summary.tasks.total > 0 && (
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Tasks by Status</h3>
            <div className="grid grid-cols-[auto_auto_auto_1fr] gap-x-4 gap-y-2 items-center text-xs">
              <span className="text-muted-foreground font-medium">Status</span>
              <span className="text-muted-foreground font-medium text-right">Count</span>
              <span className="text-muted-foreground font-medium text-right">%</span>
              <span />
              {Object.entries(summary.tasks.by_status).map(([status, count]) => {
                const percentage = summary.tasks.total > 0 ? Math.round((count / summary.tasks.total) * 100) : 0;
                return (
                  <React.Fragment key={status}>
                    <span className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                      <StatusDot status={status} colorMap={STATUS_DOT_COLORS} />
                      {status}
                    </span>
                    <span className="font-medium text-foreground text-right">{count}</span>
                    <span className="text-muted-foreground text-right">{percentage}%</span>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                      <div
                        className={`h-full ${STATUS_BAR_COLORS[status] || "bg-gray-400"} rounded-full transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Subtasks Status Breakdown */}
        <div className={`bg-white rounded-xl border border-border p-5 shadow-sm ${summary.tasks.total === 0 ? "lg:col-span-2" : ""}`}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Subtasks by Status</h3>
          <div className="grid grid-cols-[auto_auto_auto_1fr] gap-x-4 gap-y-2 items-center text-xs">
            <span className="text-muted-foreground font-medium">Status</span>
            <span className="text-muted-foreground font-medium text-right">Count</span>
            <span className="text-muted-foreground font-medium text-right">%</span>
            <span />
            {Object.entries(summary.subtasks.by_status).map(([status, count]) => {
              const percentage = summary.subtasks.total > 0 ? Math.round((count / summary.subtasks.total) * 100) : 0;
              return (
                <React.Fragment key={status}>
                  <span className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                    <StatusDot status={status} colorMap={STATUS_DOT_COLORS} />
                    {status}
                  </span>
                  <span className="font-medium text-foreground text-right">{count}</span>
                  <span className="text-muted-foreground text-right">{percentage}%</span>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                    <div
                      className={`h-full ${STATUS_BAR_COLORS[status] || "bg-gray-400"} rounded-full transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Overdue Section */}
      <div className={`grid grid-cols-1 ${isManager ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-4`}>
        {/* Projects Overdue (Manager Only) */}
        {isManager && (
          <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Projects Overdue</h3>
                {summary.overdue_projects_total !== undefined && summary.overdue_projects_total > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                    {summary.overdue_projects_total}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate("/dashboard/overdue/projects")}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                View all →
              </button>
            </div>
            {!summary.overdue_projects || summary.overdue_projects.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nothing overdue</p>
            ) : (
              <div className="divide-y divide-border">
                {summary.overdue_projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="flex items-center justify-between py-2.5 px-1 hover:bg-red-50/40 rounded transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold text-foreground truncate">{project.title}</p>
                      {project.department_name && (
                        <p className="text-[11px] text-muted-foreground truncate">{project.department_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-red-600">
                      <span className="text-xs font-semibold">
                        {project.days_overdue} {project.days_overdue === 1 ? "day" : "days"} overdue
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tasks Overdue */}
        {summary.tasks.total > 0 && (
          <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Tasks Overdue</h3>
                {summary.overdue_tasks_total !== undefined && summary.overdue_tasks_total > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                    {summary.overdue_tasks_total}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate("/dashboard/overdue/tasks")}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                View all →
              </button>
            </div>
            {!summary.overdue_tasks || summary.overdue_tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nothing overdue</p>
            ) : (
              <div className="divide-y divide-border">
                {summary.overdue_tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center justify-between py-2.5 px-1 hover:bg-red-50/40 rounded transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold text-foreground truncate">{task.title}</p>
                      {task.project_name && (
                        <p className="text-[11px] text-muted-foreground truncate">{task.project_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-red-600">
                      <span className="text-xs font-semibold">
                        {task.days_overdue} {task.days_overdue === 1 ? "day" : "days"} overdue
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subtasks Overdue */}
        <div className={`bg-white rounded-xl border border-red-200 p-5 shadow-sm ${summary.tasks.total === 0 && !isManager ? "lg:col-span-2" : ""}`}>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-foreground">Subtasks Overdue</h3>
              {summary.overdue_subtasks_total !== undefined && summary.overdue_subtasks_total > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                  {summary.overdue_subtasks_total}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate("/dashboard/overdue/subtasks")}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              View all →
            </button>
          </div>
          {!summary.overdue_subtasks || summary.overdue_subtasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nothing overdue</p>
          ) : (
            <div className="divide-y divide-border">
              {summary.overdue_subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  onClick={() => navigate(`/subtasks/${subtask.id}`)}
                  className="flex items-center justify-between py-2.5 px-1 hover:bg-red-50/40 rounded transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs font-bold text-foreground truncate">{subtask.title}</p>
                    {(subtask.task_title || subtask.project_name) && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {[subtask.project_name, subtask.task_title].filter(Boolean).join(" → ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-red-600">
                    <span className="text-xs font-semibold">
                      {subtask.days_overdue} {subtask.days_overdue === 1 ? "day" : "days"} overdue
                    </span>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Due */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Upcoming Due</h3>
          <p className="text-xs text-muted-foreground">Items due soon (top 10)</p>
        </div>
        {summary.upcoming_due.length === 0 ? (
          <div className="p-8 text-center">
            <Clock size={32} className="text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming due items</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {summary.upcoming_due.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => {
                  if (item.type === "task") {
                    navigate(`/tasks/${item.id}`);
                  } else {
                    navigate(`/subtasks/${item.id}`);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        item.type === "task"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}
                    >
                      {item.type === "task" ? "Task" : "Subtask"}
                    </span>
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {item.project_name && <span>{item.project_name}</span>}
                    {item.task_title && <span>→ {item.task_title}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className={`text-xs font-mono ${getDueDateColor(item.due_date)}`}>
                    {fmtDate(item.due_date)}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
                      STATUS_COLORS[item.status] || "bg-gray-100 text-gray-700 border-gray-200"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
