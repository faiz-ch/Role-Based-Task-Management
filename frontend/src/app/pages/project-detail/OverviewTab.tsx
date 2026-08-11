import React from "react";
import { AlertTriangle, CheckCircle, Clock, Activity } from "lucide-react";
import { Project, Task, Subtask } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { PriBadge } from "../../components/PriBadge";

interface OverviewTabProps {
  project: Project;
  tasks: Task[];
  subtasks: Subtask[];
  activity: any[];
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

function fmtDateOnly(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(dueDate: string, status: string) {
  return (
    status !== "Done" &&
    !!dueDate &&
    new Date(dueDate) < new Date()
  );
}

function isDueToday(dueDate: string) {
  if (!dueDate) return false;
  const today = new Date();
  const due = new Date(dueDate);
  return (
    today.getFullYear() === due.getFullYear() &&
    today.getMonth() === due.getMonth() &&
    today.getDate() === due.getDate()
  );
}

export function OverviewTab({ project, tasks, subtasks, activity }: OverviewTabProps) {
  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const completedTasks = projectTasks.filter((t) => t.status === "Done").length;
  const taskProgress = projectTasks.length > 0 
    ? Math.round((completedTasks / projectTasks.length) * 100) 
    : 0;

  const overdueTasks = projectTasks.filter((t) => isOverdue(t.dueDate, t.status));
  const reviewTasks = projectTasks.filter((t) => t.status === "Review");
  const projectSubtasks = subtasks.filter((s) => projectTasks.some((t) => t.id === s.taskId));
  const subtasksDueToday = projectSubtasks.filter((s) => isDueToday(s.dueDate));

  const recentActivity = activity.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Overall Progress</h3>
            <span className="text-2xl font-bold text-foreground">{taskProgress}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${taskProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {completedTasks} of {projectTasks.length} tasks completed
          </p>
        </div>

        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Tasks Summary</h3>
            <span className="text-2xl font-bold text-foreground">{projectTasks.length}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">To Do</span>
              <span className="font-medium text-foreground">
                {projectTasks.filter((t) => t.status === "To Do").length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">In Progress</span>
              <span className="font-medium text-foreground">
                {projectTasks.filter((t) => t.status === "Review").length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Done</span>
              <span className="font-medium text-foreground">
                {projectTasks.filter((t) => t.status === "Done").length}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Subtasks Summary</h3>
            <span className="text-2xl font-bold text-foreground">{projectSubtasks.length}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">To Do</span>
              <span className="font-medium text-foreground">
                {projectSubtasks.filter((s) => s.status === "To Do").length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">In Progress</span>
              <span className="font-medium text-foreground">
                {projectSubtasks.filter((s) => s.status === "Review").length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Done</span>
              <span className="font-medium text-foreground">
                {projectSubtasks.filter((s) => s.status === "Done").length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Attention Required */}
      {(overdueTasks.length > 0 || reviewTasks.length > 0 || subtasksDueToday.length > 0) && (
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Attention Required</h3>
          </div>
          <div className="space-y-4">
            {overdueTasks.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-red-600 mb-2">
                  Overdue Tasks ({overdueTasks.length})
                </h4>
                <div className="space-y-2">
                  {overdueTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-100"
                    >
                      <Clock size={14} className="text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        <p className="text-xs text-red-600">
                          Due: {fmtDateOnly(task.dueDate)}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewTasks.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-blue-600 mb-2">
                  Tasks Awaiting Review ({reviewTasks.length})
                </h4>
                <div className="space-y-2">
                  {reviewTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-blue-50 border border-blue-100"
                    >
                      <CheckCircle size={14} className="text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        <p className="text-xs text-blue-600">
                          Due: {fmtDateOnly(task.dueDate)}
                        </p>
                      </div>
                      <PriBadge priority={task.priority} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {subtasksDueToday.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-amber-600 mb-2">
                  Subtasks Due Today ({subtasksDueToday.length})
                </h4>
                <div className="space-y-2">
                  {subtasksDueToday.slice(0, 5).map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-amber-50 border border-amber-100"
                    >
                      <Clock size={14} className="text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{subtask.title}</p>
                        <p className="text-xs text-amber-600">
                          Due today
                        </p>
                      </div>
                      <StatusBadge status={subtask.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((act) => (
              <div key={act.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{act.description || act.action}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(act.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}