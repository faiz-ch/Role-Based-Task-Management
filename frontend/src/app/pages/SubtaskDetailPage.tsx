import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Subtask, UserType, Task, Project } from "../types";
import { getSubtask } from "../api/subtasks";
import { getTask } from "../api/tasks";
import { getProject } from "../api/projects";
import { getUsers } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";
import { Av } from "../components/Av";

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

export function SubtaskDetailPage() {
  const { subtaskId } = useParams<{ subtaskId: string }>();
  const navigate = useNavigate();
  const { currentUser, permissions } = useAuth();
  const [subtask, setSubtask] = useState<Subtask | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = permissions.includes("project:manage");

  function canManageSubtask(): boolean {
    if (!subtask || !task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId ||
      subtask.assigneeIds.includes(currentUser?.id || 0)
    );
  }

  function isSubtaskAssignee(): boolean {
    return subtask?.assigneeIds.includes(currentUser?.id || 0) || false;
  }

  useEffect(() => {
    async function loadData() {
      if (!subtaskId) {
        setError("Subtask ID is required");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const [subtaskResult, usersResult] = await Promise.allSettled([
          getSubtask(Number(subtaskId)),
          getUsers(),
        ]);

        setSubtask(subtaskResult.status === "fulfilled" ? subtaskResult.value : null);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);

        if (subtaskResult.status === "fulfilled" && subtaskResult.value) {
          try {
            const taskData = await getTask(subtaskResult.value.taskId);
            setTask(taskData);

            try {
              const projectData = await getProject(taskData.projectId);
              setProject(projectData);
            } catch (err) {
              console.error("Failed to load project:", err);
            }
          } catch (err) {
            console.error("Failed to load task:", err);
          }
        }

        if (subtaskResult.status === "rejected") {
          setError((subtaskResult.reason as any)?.message || "Failed to load subtask.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subtaskId]);

  const assignees = users.filter((u) => subtask?.assigneeIds.includes(u.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading subtask...</span>
      </div>
    );
  }

  if (error || !subtask) {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error || "Subtask not found"}</span>
        </div>
        <button
          onClick={() => task ? navigate(`/tasks/${task.id}`) : navigate("/tasks")}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
        >
          ← Back to task
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Back button + breadcrumb */}
      <div className="mb-6">
        <button
          onClick={() => task ? navigate(`/tasks/${task.id}`) : navigate("/tasks")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back to task
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 space-y-4">
          {/* Title + status */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-foreground">{subtask.title}</h1>
              <StatusBadge status={subtask.status} />
              <PriBadge priority={subtask.priority} />
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Description</h2>
            {subtask.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{subtask.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description</p>
            )}
          </div>

          {/* Reporting placeholder */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Report</h2>
            <p className="text-sm text-muted-foreground italic">Coming soon</p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 space-y-4">
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Assignees</span>
                <div className="mt-1">
                  {assignees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No assignees</p>
                  ) : (
                    <div className="space-y-1">
                      {assignees.map((assignee) => (
                        <div key={assignee.id} className="flex items-center gap-2">
                          <Av name={assignee.name} size="sm" />
                          <span className="text-sm text-foreground">{assignee.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Priority</span>
                <div className="mt-1">
                  <PriBadge priority={subtask.priority} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</span>
                <p className="text-sm text-foreground mt-1">{fmtDate(subtask.dueDate)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Task</span>
                <p className="text-sm text-foreground mt-1">
                  {task ? task.title : "None"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Project</span>
                <p className="text-sm text-foreground mt-1">
                  {project ? project.name : "None"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
