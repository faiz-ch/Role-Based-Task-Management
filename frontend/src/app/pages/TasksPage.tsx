import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { Task, UserType, Status, Priority } from "../types";
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
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { StatusBadge, STATUS_STYLE } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";

const STATUSES: Status[] = ["To Do", "In Progress", "Review", "Done"];
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

// Card subcomponent
function TaskCard({
  task,
  users,
  permissions,
  currentUserId,
  onEdit,
  onDelete,
  onAssign,
  onDragStart,
}: {
  task: Task;
  users: UserType[];
  permissions: string[];
  currentUserId: number;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: (uid: number | null) => void;
  onDragStart: () => void;
}) {
  const canEdit = permissions.includes("task:edit");
  const canAssign = permissions.includes("task:assign");
  const canDrag = canEdit || task.assigneeId === currentUserId;
  const assignee = users.find((u) => u.id === task.assigneeId);
  const od = isOverdue(task.dueDate, task.status);

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      className={`bg-white rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-all group ${
        canDrag ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">
          {task.title}
        </p>
        {canEdit && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
            >
              <Edit2 size={11} className="text-muted-foreground" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
            >
              <Trash2 size={11} className="text-red-400" />
            </button>
          </div>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground mb-2.5 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-1.5 mb-2.5">
        <PriBadge priority={task.priority} />
        {od && (
          <span className="inline-flex items-center gap-0.5 text-xs text-red-500 font-medium">
            <AlertTriangle size={10} /> Overdue
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {task.dueDate ? (
          <span
            className={`text-xs font-mono flex-shrink-0 ${
              od ? "text-red-500" : "text-muted-foreground"
            }`}
          >
            {fmtDate(task.dueDate)}
          </span>
        ) : (
          <span />
        )}
        <div className="flex-shrink-0">
          {canAssign ? (
            <select
              value={task.assigneeId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onAssign(val === "" ? null : Number(val));
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-xs border border-border rounded-md px-1.5 py-0.5 bg-white text-muted-foreground focus:outline-none focus:border-blue-400 max-w-[100px] truncate"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : assignee ? (
            <Av name={assignee.name} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Main page component
export function TasksPage() {
  const { currentUser, permissions } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null);
  const [form, setForm] = useState<TForm>({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    assigneeId: null,
  });

  const canCreate = permissions.includes("task:create");
  const canEdit = permissions.includes("task:edit");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedTasks, fetchedUsers] = await Promise.all([
          getTasks(),
          getUsers(),
        ]);
        setTasks(fetchedTasks);
        setUsers(fetchedUsers);
      } catch (err: any) {
        setError(err?.message || "Failed to load tasks data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

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
      const newTask = await createTask({
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate,
        assigneeId: form.assigneeId,
      });
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

  async function dropOnCol(col: Status) {
    if (dragId !== null) {
      try {
        setError(null);
        const updated = await updateTaskStatus(dragId, col);
        setTasks((prev) => prev.map((t) => (t.id === dragId ? updated : t)));
      } catch (err: any) {
        setError(err?.message || "Failed to update task status.");
      }
    }
    setDragId(null);
    setDragOverCol(null);
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
            {tasks.length} tasks · {canEdit ? "Drag cards to update status" : "View-only"}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={14} /> New Task
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm flex-shrink-0">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 items-start overflow-y-auto">
        {STATUSES.map((col) => {
          const s = STATUS_STYLE[col];
          const colTasks = tasks.filter((t) => t.status === col);
          const isTarget = dragOverCol === col;

          return (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null);
                }
              }}
              onDrop={() => dropOnCol(col)}
              className={`rounded-xl border-t-2 ${s.colTop} ${s.colBg} transition-all ${
                isTarget
                  ? "ring-2 ring-blue-400 ring-offset-1 ring-offset-background"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-sm font-semibold text-foreground">{col}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground bg-white border border-border px-1.5 py-0.5 rounded">
                  {colTasks.length}
                </span>
              </div>
              <div className="px-2 pb-3 space-y-2 min-h-[100px]">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    users={users}
                    permissions={permissions}
                    currentUserId={currentUser?.id ?? 0}
                    onEdit={() => openEdit(task)}
                    onDelete={() => handleDelete(task.id)}
                    onAssign={(uid) => handleAssign(task, uid)}
                    onDragStart={() => setDragId(task.id)}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div
                    className={`flex items-center justify-center h-16 border-2 border-dashed rounded-lg ${
                      isTarget ? "border-blue-300 bg-blue-50/50" : "border-border"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground">Drop here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </div>
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
                { value: "", label: "Unassigned" },
                ...users.map((u) => ({ value: u.id, label: u.name })),
              ]}
            />
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
                type="date"
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
