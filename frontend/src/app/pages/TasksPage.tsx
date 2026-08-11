import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Edit2, Trash2, AlertTriangle, Search, MoreVertical, ChevronRight } from "lucide-react";
import { Task, UserType, Status, Priority, Department, Project, Subtask } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  assignTask,
  deleteTask,
} from "../api/tasks";
import { getProjects, getProjectCandidates } from "../api/projects";
import { getSubtasks } from "../api/subtasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { PriBadge } from "../components/PriBadge";
import { DatePicker } from "../components/DatePicker";
import { StatusBadge } from "../components/StatusBadge";

const STATUSES: Status[] = ["To Do", "Review", "Done", "Reschedule"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

interface TForm {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  projectId: number;
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

function isOverdue(dueDate: string, status: Status) {
  return (
    status !== "Done" &&
    !!dueDate &&
    new Date(dueDate) < new Date()
  );
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

function getTaskProgress(task: Task, subtasks: Subtask[]): number {
  const taskSubtasks = subtasks.filter(s => s.taskId === task.id);
  if (taskSubtasks.length === 0) return 0;
  const completed = taskSubtasks.filter(s => s.status === "Done").length;
  return Math.round((completed / taskSubtasks.length) * 100);
}

export function TasksPage() {
  const navigate = useNavigate();
  const { currentUser, permissions } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCandidates, setProjectCandidates] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterDueDate, setFilterDueDate] = useState<string>("");
  const [filterProject, setFilterProject] = useState<string>("");
  const [scope, setScope] = useState<"all" | "mine">("all");

  const [showNew, setShowNew] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<number | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [form, setForm] = useState<TForm>({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    projectId: 0,
    assigneeId: null,
  });

  const canManage = permissions.includes("project:manage");

  // Build projects map for permission checks
  const projectsById = projects.reduce((map, p) => {
    map[p.id] = p;
    return map;
  }, {} as Record<number, Project>);

  function canManageTask(task: Task): boolean {
    const project = projectsById[task.projectId];
    if (!project) return false;
    const hasProjectManagePermission = permissions.includes("project:manage") && (
      currentUser?.role?.allDepartments ||
      (project.departmentIds && currentUser?.role?.departments?.some(d => project.departmentIds.includes(d.id)))
    );
    return (
      hasProjectManagePermission ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId
    );
  }

  function isTaskAssignee(task: Task): boolean {
    return currentUser?.id === task.assigneeId;
  }

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [tasksResult, subtasksResult, usersResult, departmentsResult, projectsResult] = await Promise.allSettled([
          scope === "mine" && currentUser ? getTasks({ assignedTo: currentUser.id }) : getTasks(),
          getSubtasks(),
          getUsers(),
          getDepartments(),
          getProjects(),
        ]);

        setTasks(tasksResult.status === "fulfilled" ? tasksResult.value : []);
        setSubtasks(subtasksResult.status === "fulfilled" ? subtasksResult.value : []);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
        setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);
        setProjects(projectsResult.status === "fulfilled" ? projectsResult.value : []);

        if (tasksResult.status === "rejected") {
          setError((tasksResult.reason as any)?.message || "Failed to load tasks.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [scope, currentUser]);

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
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

    if (filterProject && task.projectId !== Number(filterProject)) return false;
    
    return true;
  });

  async function openNew() {
    setForm({
      title: "",
      description: "",
      priority: "Medium",
      dueDate: "",
      projectId: 0,
      assigneeId: null,
    });
    setProjectCandidates([]);
    setAssigneeSearch("");
    setShowNew(true);
  }

  function openEdit(t: Task) {
    setForm({
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDate: t.dueDate,
      projectId: t.projectId,
      assigneeId: t.assigneeId,
    });
    setEditTask(t);
  }

  async function saveNew() {
    if (!form.title.trim() || !form.projectId) return;
    try {
      setError(null);
      const taskData: any = {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate,
        projectId: form.projectId,
      };
      if (form.assigneeId !== null) {
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

  async function handleDelete(taskId: number) {
    try {
      setError(null);
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDeleteConfirmTaskId(null);
    } catch (err: any) {
      setError(err?.message || "Failed to delete task.");
    }
  }

  async function handleStatusChange(task: Task, newStatus: Status) {
    try {
      setError(null);
      const updated = await updateTaskStatus(task.id, { status: newStatus });
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle className="w-8 h-8 text-red-500 mr-3" />
        <span className="text-sm text-muted-foreground">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header with filters */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Group by:</span>
            <span className="text-sm font-medium text-foreground">Status</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
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
          
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        {filteredTasks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No tasks match the current filters
          </div>
        ) : (
          <div className="flex gap-4 min-w-max">
            {STATUSES.map((status) => {
              const columnTasks = filteredTasks.filter((t) => t.status === status);
              return (
                <div key={status} className="w-80 flex-shrink-0">
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        status === "To Do" ? "bg-gray-400" :
                        status === "Review" ? "bg-blue-500" :
                        status === "Done" ? "bg-green-500" :
                        "bg-orange-500"
                      }`} />
                      <h3 className="text-sm font-semibold text-foreground">{status}</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-full">
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Column Cards */}
                  <div className="space-y-3">
                    {columnTasks.map((task) => {
                      const assignee = users.find((u) => u.id === task.assigneeId);
                      const project = projectsById[task.projectId];
                      const progress = getTaskProgress(task, subtasks);
                      return (
                        <div
                          key={task.id}
                          onClick={() => navigate(`/tasks/${task.id}`)}
                          className="bg-white rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="text-sm font-medium text-foreground flex-1 pr-2 line-clamp-2">
                              {task.title}
                            </h4>
                            <PriBadge priority={task.priority} />
                          </div>
                          
                          {project && (
                            <p className="text-xs text-muted-foreground mb-3 truncate">{project.name}</p>
                          )}
                          
                          {/* Progress bar for tasks with subtasks */}
                          {progress > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-muted-foreground">Progress</span>
                                <span className="text-xs font-medium text-foreground">{progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div 
                                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-3">
                            {assignee && (
                              <div className="flex items-center gap-2">
                                <Av name={assignee.name} size="sm" />
                                <span className="text-xs text-muted-foreground">{assignee.name}</span>
                              </div>
                            )}
                            {task.dueDate && (
                              <p className={`text-xs ${getDueDateColor(task.dueDate)}`}>
                                {fmtDate(task.dueDate)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Add Task Button */}
                    <button
                      onClick={() => openNew()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Task
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Task Dialog */}
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
            <FldSelect
              label="Project"
              value={form.projectId.toString()}
              onChange={async (e) => {
                const newProjectId = Number(e.target.value);
                setForm((f) => ({ ...f, projectId: newProjectId }));
                if (newProjectId > 0) {
                  try {
                    const candidates = await getProjectCandidates(newProjectId);
                    setProjectCandidates(candidates);
                  } catch (err) {
                    console.error("Failed to load project candidates:", err);
                    setProjectCandidates([]);
                  }
                } else {
                  setProjectCandidates([]);
                }
              }}
              options={[
                { value: "0", label: "Select project" },
                ...projects
                  .filter((p) => p.leadId === currentUser?.id)
                  .map((p) => ({ value: p.id.toString(), label: p.name })),
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <FldSelect
                label="Priority"
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value as Priority }))
                }
                options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              />
              <DatePicker
                label="Due Date"
                value={form.dueDate}
                onChange={(value) => setForm((f) => ({ ...f, dueDate: value }))}
                min={new Date().toISOString().slice(0, 16)}
                max={form.projectId && projectsById[form.projectId]?.dueDate ? projectsById[form.projectId].dueDate.slice(0, 16) : undefined}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Assignee</label>
              <input
                type="text"
                placeholder="Search assignees..."
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 mb-2"
              />
              <FldSelect
                label=""
                value={form.assigneeId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({
                    ...f,
                    assigneeId: val === "" ? null : Number(val),
                  }));
                }}
                options={[
                  { value: "", label: "Auto-assign to you" },
                  ...(form.projectId > 0 ? projectCandidates : users)
                    .filter((u) => u.name.toLowerCase().includes(assigneeSearch.toLowerCase()))
                    .map((u) => ({ value: u.id, label: u.name })),
                ]}
                disabled={form.projectId === 0 && !canManage}
              />
              {form.projectId === 0 && !canManage && (
                <p className="text-xs text-muted-foreground mt-1">
                  Assignee is automatically set to yourself for standalone tasks
                </p>
              )}
            </div>
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

      {/* Edit Task Dialog */}
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
              <DatePicker
                label="Due Date"
                value={form.dueDate}
                onChange={(value) => setForm((f) => ({ ...f, dueDate: value }))}
                min={new Date().toISOString().slice(0, 16)}
                max={form.projectId && projectsById[form.projectId]?.dueDate ? projectsById[form.projectId].dueDate.slice(0, 16) : undefined}
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

      {/* Delete Confirmation Dialog */}
      {deleteConfirmTaskId !== null && (
        <Dlg title="Delete task" onClose={() => setDeleteConfirmTaskId(null)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete this task? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmTaskId(null)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmTaskId)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
