import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Task, UserType, Status, Priority, Department } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  assignTask,
  deleteTask,
} from "../api/tasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { StatusBadge, STATUS_STYLE } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";

const STATUSES: Status[] = ["To Do", "Review", "Done", "Reschedule"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

interface TForm {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  assigneeId: number | null;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtMonthYear(d: string) {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isOverdue(dueDate: string, status: Status) {
  return (
    status !== "Done" &&
    !!dueDate &&
    new Date(dueDate) < new Date()
  );
}

function getValidTransitions(
  task: Task,
  permissions: string[],
  currentUserId: number
): { label: string; status: Status }[] {
  const canEdit = permissions.includes("task:edit");
  const canReview = permissions.includes("task:review");
  const isAssignee = task.assigneeId === currentUserId;

  if (canEdit) {
    // Can move to any status except current
    return STATUSES.filter((s) => s !== task.status).map((s) => ({
      label: `Move to ${s}`,
      status: s,
    }));
  }

  if (isAssignee) {
    if (task.status === "To Do") {
      return [{ label: "Submit for review", status: "Review" }];
    }
    if (task.status === "Reschedule") {
      return [{ label: "Resubmit for review", status: "Review" }];
    }
  }

  if (canReview) {
    if (task.status === "Review") {
      // Approve is a simple status flip (fits this dropdown). Reschedule is
      // deliberately NOT offered here — it requires picking a new due
      // date/time, which doesn't fit a plain dropdown. That action lives on
      // the Task Detail page instead (a later step), which calls the
      // dedicated /reschedule endpoint with the date the reviewer picks.
      return [{ label: "Approve (Done)", status: "Done" }];
    }
  }

  return [];
}

// Main page component
interface TasksPageProps {
  onOpenTask?: (id: number) => void;
}

export function TasksPage({ onOpenTask }: TasksPageProps = {}) {
  const { currentUser, permissions } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<Status>("To Do");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterDueDate, setFilterDueDate] = useState<string>("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const [showNew, setShowNew] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TForm>({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    assigneeId: null,
  });

  const canCreate = permissions.includes("task:create");
  const canEdit = permissions.includes("task:edit");
  const canAssign = permissions.includes("task:assign");
  const canViewAll = permissions.includes("task:view");

  useEffect(() => {
  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [tasksResult, usersResult, departmentsResult] = await Promise.allSettled([
        canViewAll && scope === "mine" && currentUser
          ? getTasks({ assignedTo: currentUser.id })
          : getTasks(),
        getUsers(),
        getDepartments(),
      ]);

      setTasks(tasksResult.status === "fulfilled" ? tasksResult.value : []);
      setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
      setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);

      if (tasksResult.status === "rejected") {
        setError((tasksResult.reason as any)?.message || "Failed to load tasks.");
      }
      // Intentionally silent if users/departments fail — those are
      // supplementary data (names/dropdowns), not the core content of this page.
    } finally {
      setLoading(false);
    }
  }
  loadData();
}, [scope, canViewAll, currentUser]);

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (task.status !== selectedStatus) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!task.title.toLowerCase().includes(query) && 
          !task.description.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    if (filterAssignee) {
      const assigneeId = filterAssignee === "" ? null : Number(filterAssignee);
      if (task.assigneeId !== assigneeId) return false;
    }
    
    if (filterPriority && task.priority !== filterPriority) return false;
    
    if (filterDueDate) {
      const now = new Date();
      const taskDate = task.dueDate ? new Date(task.dueDate + "T23:59:59") : null;
      
      if (filterDueDate === "overdue") {
        if (!taskDate || taskDate >= now || task.status === "Done") return false;
      } else if (filterDueDate === "this_week") {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        if (!taskDate || taskDate < now || taskDate > weekEnd) return false;
      } else if (filterDueDate === "this_month") {
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (!taskDate || taskDate < now || taskDate > monthEnd) return false;
      } else if (filterDueDate === "no_due_date") {
        if (taskDate) return false;
      }
    }
    
    return true;
  });

  // Group by month
  const groupedTasks = filteredTasks.reduce((groups, task) => {
    const monthKey = task.dueDate ? fmtMonthYear(task.dueDate) : "No due date";
    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(task);
    return groups;
  }, {} as Record<string, Task[]>);

  // Sort months: most recent first, "No due date" last
  const sortedMonths = Object.keys(groupedTasks).sort((a, b) => {
    if (a === "No due date") return 1;
    if (b === "No due date") return -1;
    return new Date(b).getTime() - new Date(a).getTime();
  });

  // Expand first month by default
  useEffect(() => {
    if (sortedMonths.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([sortedMonths[0]]));
    }
  }, [sortedMonths]);

  function toggleMonth(month: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  }

  function openNew() {
    setForm({
      title: "",
      description: "",
      priority: "Medium",
      dueDate: "",
      assigneeId: null,
    });
    setShowNew(true);
  }

  function openEdit(t: Task) {
    setForm({
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDate: t.dueDate,
      assigneeId: t.assigneeId,
    });
    setEditTask(t);
  }

  async function saveNew() {
    if (!form.title.trim()) return;
    try {
      setError(null);
      const taskData: any = {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate,
      };
      // Only include assigneeId if user has assign permissions
      if (canAssign) {
        taskData.assigneeId = form.assigneeId;
      }
      const newTask = await createTask(taskData);
      setTasks((prev) => [...prev, newTask]);
      setShowNew(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create task.");
    }
  }

  async function saveEdit() {
    if (!editTask || !form.title.trim()) return;
    try {
      setError(null);
      const updated = await updateTask(editTask.id, {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate,
      });
      setTasks((prev) => prev.map((t) => (t.id === editTask.id ? updated : t)));
      setEditTask(null);
    } catch (err: any) {
      setError(err?.message || "Failed to update task.");
    }
  }

  async function handleAssign(task: Task, assigneeId: number | null) {
    try {
      setError(null);
      const updated = await assignTask(task.id, assigneeId);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: any) {
      setError(err?.message || "Failed to assign task.");
    }
  }

  async function handleDelete(taskId: number) {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      setError(null);
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete task.");
    }
  }

  async function handleStatusTransition(task: Task, newStatus: Status) {
    try {
      setError(null);
      const updated = await updateTaskStatus(task.id, newStatus);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: any) {
      setError(err?.message || "Failed to update task status.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading tasks...</span>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.length} total tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canViewAll && (
            <div className="flex items-center bg-muted/40 rounded-lg p-1">
              <button
                onClick={() => setScope("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === "all"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Tasks
              </button>
              <button
                onClick={() => setScope("mine")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === "mine"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                My Tasks
              </button>
            </div>
          )}
          {canCreate && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              <Plus size={14} /> New Task
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm flex-shrink-0">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex items-center gap-2 mb-4 flex-shrink-0 overflow-x-auto pb-2">
        {STATUSES.map((status) => {
          const count = tasks.filter((t) => t.status === status).length;
          const isSelected = selectedStatus === status;
          const s = STATUS_STYLE[status];
          return (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isSelected
                  ? `${s.badge} border-2`
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {status}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isSelected ? "bg-white/50" : "bg-muted"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
          />
        </div>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
        >
          <option value="">All assignees</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filterDueDate}
          onChange={(e) => setFilterDueDate(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
        >
          <option value="">All due dates</option>
          <option value="overdue">Overdue</option>
          <option value="this_week">This week</option>
          <option value="this_month">This month</option>
          <option value="no_due_date">No due date</option>
        </select>
      </div>

      {/* Task list grouped by month */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {sortedMonths.map((month) => {
          const monthTasks = groupedTasks[month];
          const isExpanded = expandedMonths.has(month);
          return (
            <div key={month} className="bg-white rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggleMonth(month)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-muted-foreground" />
                  ) : (
                    <ChevronRight size={16} className="text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold text-foreground">{month}</span>
                  <span className="text-xs text-muted-foreground">({monthTasks.length})</span>
                </div>
              </button>
              {isExpanded && (
                <div className="divide-y divide-border">
                  {monthTasks.map((task) => {
                    const assignee = users.find((u) => u.id === task.assigneeId);
                    const od = isOverdue(task.dueDate, task.status);
                    const transitions = getValidTransitions(task, permissions, currentUser?.id ?? 0);
                    
                    return (
                      <div key={task.id} className="p-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 
                                className="text-sm font-medium text-foreground cursor-pointer hover:text-blue-600 transition-colors"
                                onClick={() => onOpenTask?.(task.id)}
                              >
                                {task.title}
                              </h3>
                              <StatusBadge status={task.status} />
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <PriBadge priority={task.priority} />
                              {task.dueDate && (
                                <span className={od ? "text-red-500" : ""}>
                                  {fmtDate(task.dueDate)}
                                </span>
                              )}
                              {od && (
                                <span className="text-red-500 font-medium">Overdue</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {assignee && <Av name={assignee.name} size="sm" />}
                            {canAssign && (
                              <select
                                value={task.assigneeId ?? ""}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const val = e.target.value;
                                  handleAssign(task, val === "" ? null : Number(val));
                                }}
                                className="text-xs border border-border rounded px-2 py-1 bg-white text-muted-foreground focus:outline-none focus:border-blue-400"
                              >
                                <option value="">Unassigned</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {canEdit && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(task);
                                }}
                                className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                                title="Edit task"
                              >
                                <Edit2 size={14} className="text-muted-foreground" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(task.id);
                                }}
                                className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                title="Delete task"
                              >
                                <Trash2 size={14} className="text-red-400" />
                              </button>
                            )}
                          </div>
                        </div>
                        {transitions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            {transitions.length === 1 ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusTransition(task, transitions[0].status);
                                }}
                                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                              >
                                {transitions[0].label}
                              </button>
                            ) : (
                              <select
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleStatusTransition(task, e.target.value as Status);
                                }}
                                className="text-xs border border-border rounded px-2 py-1 bg-white text-muted-foreground focus:outline-none focus:border-blue-400 cursor-pointer"
                                defaultValue=""
                              >
                                <option value="" disabled>Move to...</option>
                                {transitions.map((t) => (
                                  <option key={t.status} value={t.status}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {sortedMonths.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No tasks match the current filters
          </div>
        )}
      </div>

      {showNew && (
        <Dlg title="New Task" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <FldInput
              label="Title"
              placeholder="What needs to be done?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Description
              </span>
              <textarea
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none placeholder:text-muted-foreground/60 text-foreground"
                rows={3}
                placeholder="Optional details..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FldSelect
                label="Priority"
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value as Priority }))
                }
                options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              />
              <FldInput
                label="Due Date"
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </div>
            {canAssign && (
              <FldSelect
                label="Assignee"
                value={form.assigneeId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({
                    ...f,
                    assigneeId: val === "" ? null : Number(val),
                  }));
                }}
                options={[
                  { value: "", label: "Select assignee" },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            )}
            {!canAssign && (
              <div className="text-xs text-muted-foreground">
                Task will be auto-assigned to you
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={saveNew}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              Create Task
            </button>
          </div>
        </Dlg>
      )}

      {editTask && (
        <Dlg title="Edit Task" onClose={() => setEditTask(null)}>
          <div className="space-y-4">
            <FldInput
              label="Title"
              placeholder="What needs to be done?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Description
              </span>
              <textarea
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none placeholder:text-muted-foreground/60 text-foreground"
                rows={3}
                placeholder="Optional details..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FldSelect
                label="Priority"
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value as Priority }))
                }
                options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              />
              <FldInput
                label="Due Date"
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setEditTask(null)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </Dlg>
      )}
    </div>
  );
}
