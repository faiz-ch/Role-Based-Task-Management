import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, Clock, Activity } from "lucide-react";
import { Project, Task, Subtask } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { PriBadge } from "../../components/PriBadge";
import { Report } from "../../api/reports";
import { Dlg } from "../../components/Dlg";
import { useAuth } from "../../context/AuthContext";

interface OverviewTabProps {
  project: Project;
  tasks: Task[];
  subtasks: Subtask[];
  activity: any[];
  reports: Report[];
  canManage?: boolean;
  onCreateReport?: (content: string) => Promise<void>;
  onSendForApproval?: () => Promise<void>;
  onApprove?: () => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
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

export function OverviewTab({
  project,
  tasks,
  subtasks,
  activity,
  reports,
  canManage,
  onCreateReport,
  onSendForApproval,
  onApprove,
  onReject,
}: OverviewTabProps) {
  const { currentUser } = useAuth();
  const [reportContent, setReportContent] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (reports && reports.length > 0) {
      setReportContent(reports[0].content);
    }
  }, [reports]);

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
  const existingReport = reports && reports.length > 0 ? reports[0] : null;

  async function handleCreateReport() {
    if (!onCreateReport || !reportContent.trim()) return;
    try {
      await onCreateReport(reportContent.trim());
    } catch (err) {
      console.error("Failed to save report:", err);
    }
  }

  async function handleSendForApproval() {
    if (!onSendForApproval) return;
    try {
      await onSendForApproval();
    } catch (err) {
      console.error("Failed to send for approval:", err);
    }
  }

  async function handleApprove() {
    if (!onApprove) return;
    try {
      await onApprove();
    } catch (err) {
      console.error("Failed to approve project:", err);
    }
  }

  async function handleReject() {
    if (!onReject || !rejectReason.trim()) return;
    try {
      await onReject(rejectReason.trim());
      setShowRejectDialog(false);
      setRejectReason("");
    } catch (err) {
      console.error("Failed to reject project:", err);
    }
  }

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

      {/* Project Report Section */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Project Report</h2>
        </div>
        {currentUser?.id === project?.leadId ? (
          <>
            <textarea
              value={reportContent}
              onChange={(e) => setReportContent(e.target.value)}
              placeholder="Enter project report..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[120px] resize-y mb-4"
              rows={5}
            />
            <div className="flex justify-end">
              <button
                onClick={handleCreateReport}
                disabled={!reportContent.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Report
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            {existingReport ? (
              <p className="whitespace-pre-wrap">{existingReport.content}</p>
            ) : (
              <p className="text-center py-8">No report submitted yet</p>
            )}
          </div>
        )}
        
        {/* Send for Approval button */}
        {(currentUser?.id === project?.leadId || canManage) &&
         project?.status === "Active" &&
         projectTasks.length > 0 &&
         projectTasks.every(t => t.status === "Done") && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={handleSendForApproval}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              Send for Approval
            </button>
          </div>
        )}
        
        {/* Approve and Reject buttons for Admin category users */}
        {project?.status === "Pending Approval" &&
         currentUser?.role?.category?.name === "Admin" && (
          <div className="mt-4 pt-4 border-t border-border flex gap-2">
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              Approve
            </button>
            <button
              onClick={() => setShowRejectDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <Dlg title="Reject project" onClose={() => setShowRejectDialog(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reason for rejection</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter the reason for rejecting this project..."
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[100px] resize-y"
                rows={4}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason("");
                }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}