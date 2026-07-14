import React, { useState, useEffect } from "react";
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Task, UserType, Status, Priority } from "../types";
import { getTasks } from "../api/tasks";
import { getUsers } from "../api/users";
import { getDashboardSummary, DashboardSummary } from "../api/dashboard";
import { Av } from "../components/Av";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";

const STATUSES: Status[] = ["To Do", "In Progress", "Review", "Done"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dueDate: string, status: Status) {
  return (
    status !== "Done" &&
    !!dueDate &&
    new Date(dueDate + "T23:59:59") < new Date()
  );
}

export function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedTasks, fetchedUsers, fetchedSummary] = await Promise.all([
          getTasks(),
          getUsers(),
          getDashboardSummary(),
        ]);
        setTasks(fetchedTasks);
        setUsers(fetchedUsers);
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

  const total = tasks.length;
  const byStatus = STATUSES.map((s) => ({
    name: s,
    count: tasks.filter((t) => t.status === s).length,
  }));
  const byPri = PRIORITIES.map((p) => ({
    name: p,
    count: tasks.filter((t) => t.priority === p).length,
  }));
  
  // Use backend summary overdue count, or fallback to client-side calculation
  const overdue = summary ? summary.overdue_count : tasks.filter((t) => isOverdue(t.dueDate, t.status)).length;

  const PIE_COLORS = ["#94a3b8", "#3b82f6", "#f59e0b", "#10b981"];
  const PRI_COLORS: Record<Priority, string> = {
    Low: "#10b981",
    Medium: "#f59e0b",
    High: "#ef4444",
  };

  const statCards = [
    { label: "Total", value: total, color: "text-foreground", Icon: CheckSquare },
    { label: "To Do", value: byStatus[0].count, color: "text-slate-500", Icon: null, dot: "bg-slate-400" },
    {
      label: "In Progress",
      value: byStatus[1].count,
      color: "text-blue-600",
      Icon: Clock,
      dot: "bg-blue-500",
    },
    {
      label: "In Review",
      value: byStatus[2].count,
      color: "text-amber-600",
      Icon: TrendingUp,
      dot: "bg-amber-500",
    },
    {
      label: "Done",
      value: byStatus[3].count,
      color: "text-emerald-600",
      Icon: CheckCircle2,
      dot: "bg-emerald-500",
    },
  ] as const;

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Project health overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map(({ label, value, color, Icon, dot }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-border p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              {Icon ? (
                <Icon size={13} className={color} />
              ) : (
                <span className={`w-2 h-2 rounded-full ${dot}`} />
              )}
            </div>
            <p className={`text-2xl font-bold tabular-nums font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {overdue > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700 font-semibold">
            {overdue} task{overdue !== 1 ? "s" : ""} overdue
          </span>
          <span className="text-red-500">— past due date and not yet done</span>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Tasks by Status</h3>
          <p className="text-xs text-muted-foreground mb-4">Distribution across 4 stages</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={byStatus}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={75}
                innerRadius={35}
                paddingAngle={2}
              >
                {byStatus.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, n: string) => [v + " tasks", n]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {byStatus.map((s, i) => (
              <div
                key={s.name}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: PIE_COLORS[i] }}
                />
                {s.name} ({s.count})
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Tasks by Priority</h3>
          <p className="text-xs text-muted-foreground mb-4">Urgency breakdown</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={byPri}
              barSize={40}
              margin={{ top: 0, bottom: 0, left: -20 }}
            >
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#6b7280" }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#6b7280" }}
              />
              <Tooltip
                cursor={{ fill: "#f1f3f7" }}
                formatter={(v: number) => [v + " tasks", "Count"]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {byPri.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={PRI_COLORS[entry.name as Priority]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent tasks */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">All Tasks</h3>
        </div>
        <div className="divide-y divide-border">
          {tasks.map((task) => {
            const assignee = users.find((u) => u.id === task.assigneeId);
            const od = isOverdue(task.dueDate, task.status);
            return (
              <div
                key={task.id}
                className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {task.title}
                  </p>
                  <p
                    className={`text-xs font-mono ${
                      od ? "text-red-500" : "text-muted-foreground"
                    }`}
                  >
                    {fmtDate(task.dueDate)}
                    {od ? " — overdue" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <PriBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                  {assignee && <Av name={assignee.name} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
