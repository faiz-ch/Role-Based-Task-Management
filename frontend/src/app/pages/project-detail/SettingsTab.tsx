import React, { useState } from "react";
import { Edit2, Trash2, Archive, RotateCcw, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { Project, Department, Task } from "../../types";
import { Dlg } from "../../components/Dlg";
import { FldSelect } from "../../components/FldSelect";
import { DatePicker } from "../../components/DatePicker";

interface SettingsTabProps {
  project: Project;
  departments: Department[];
  tasks: Task[];
  onEditProject: (projectData: any) => Promise<void>;
  onDeleteProject: () => Promise<void>;
  onCloseProject: (closingNotes?: string) => Promise<void>;
  onReopenProject: (reason: string) => Promise<void>;
}

interface EditForm {
  name: string;
  description: string;
  priority: string;
  dueDate: string;
  departmentIds: number[];
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

export function SettingsTab({ 
  project, 
  departments, 
  tasks,
  onEditProject, 
  onDeleteProject, 
  onCloseProject, 
  onReopenProject 
}: SettingsTabProps) {
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    departmentIds: [],
  });
  const [closingNotes, setClosingNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  async function handleEditProject() {
    if (!editForm.name.trim()) return;
    try {
      await onEditProject(editForm);
      setShowEditProject(false);
    } catch (err: any) {
      console.error("Failed to edit project:", err);
    }
  }

  async function handleDeleteProject() {
    try {
      await onDeleteProject();
      setShowDeleteConfirm(false);
    } catch (err: any) {
      console.error("Failed to delete project:", err);
    }
  }

  async function handleCloseProject() {
    try {
      await onCloseProject(closingNotes.trim() || undefined);
      setShowCloseDialog(false);
      setClosingNotes("");
    } catch (err: any) {
      console.error("Failed to close project:", err);
    }
  }

  async function handleReopenProject() {
    if (!reopenReason.trim()) return;
    try {
      await onReopenProject(reopenReason.trim());
      setShowReopenDialog(false);
      setReopenReason("");
    } catch (err: any) {
      console.error("Failed to reopen project:", err);
    }
  }

  function openEditProject() {
    setEditForm({
      name: project.name,
      description: project.description,
      priority: project.priority,
      dueDate: project.dueDate,
      departmentIds: project.departmentIds,
    });
    setShowEditProject(true);
  }

  // Validation checks for closing project
  function getCloseValidationChecks() {
    const projectTasks = tasks.filter((t) => t.projectId === project.id);
    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((t) => t.status === "Done").length;
    const reviewTasks = projectTasks.filter((t) => t.status === "Review").length;
    
    const overdueTasks = projectTasks.filter((t) => {
      if (t.status === "Done") return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < new Date();
    }).length;

    const allTasksCompleted = totalTasks === 0 || completedTasks === totalTasks;
    const noPendingReviews = reviewTasks === 0;
    const noOverdueItems = overdueTasks === 0;

    return {
      allTasksCompleted: {
        passed: allTasksCompleted,
        label: `All tasks completed (${completedTasks}/${totalTasks})`,
        count: completedTasks,
        total: totalTasks,
      },
      noPendingReviews: {
        passed: noPendingReviews,
        label: `No pending reviews (${reviewTasks} pending)`,
        count: reviewTasks,
      },
      noOverdueItems: {
        passed: noOverdueItems,
        label: `No overdue items (${overdueTasks} overdue)`,
        count: overdueTasks,
      },
      canClose: allTasksCompleted && noPendingReviews && noOverdueItems,
    };
  }

  function toggleEditDepartment(deptId: number) {
    setEditForm((prev) => ({
      ...prev,
      departmentIds: prev.departmentIds.includes(deptId)
        ? prev.departmentIds.filter((id) => id !== deptId)
        : [...prev.departmentIds, deptId],
    }));
  }

  const canClose = project.status === "Active" || project.status === "Pending Approval";
  const canReopen = project.status === "Archived";

  return (
    <>
      <div className="space-y-6">
        {/* Project Actions */}
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Project Actions</h2>
          
          <div className="space-y-3">
            <button
              onClick={openEditProject}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer text-left"
            >
              <Edit2 size={18} className="text-blue-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Edit Project</p>
                <p className="text-xs text-muted-foreground">Update project details, priority, and departments</p>
              </div>
            </button>

            {canClose && (
              <button
                onClick={() => setShowCloseDialog(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer text-left"
              >
                <Archive size={18} className="text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Close Project</p>
                  <p className="text-xs text-muted-foreground">Mark project as completed and archive it</p>
                </div>
              </button>
            )}

            {canReopen && (
              <button
                onClick={() => setShowReopenDialog(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer text-left"
              >
                <RotateCcw size={18} className="text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Reopen Project</p>
                  <p className="text-xs text-muted-foreground">Reactivate an archived project</p>
                </div>
              </button>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors cursor-pointer text-left"
            >
              <Trash2 size={18} className="text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-600">Delete Project</p>
                <p className="text-xs text-red-500">Permanently delete project and all its data</p>
              </div>
            </button>
          </div>
        </div>

        {/* Reopen History */}
        {project.reopenedAt && (
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Reopen History</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <RotateCcw size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Project Reopened</p>
                  {project.reopenedReason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reason: {project.reopenedReason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDate(project.reopenedAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Project Details */}
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Project Details</h2>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
              <p className="text-sm text-foreground mt-1">{project.status}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Priority</span>
              <p className="text-sm text-foreground mt-1">{project.priority}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Created</span>
              <p className="text-sm text-foreground mt-1">{fmtDate(project.createdAt)}</p>
            </div>
            {project.completedAt && (
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Completed</span>
                <p className="text-sm text-foreground mt-1">{fmtDate(project.completedAt)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Project Dialog */}
      {showEditProject && (
        <Dlg title="Edit Project" onClose={() => setShowEditProject(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <DatePicker
                label="Due Date"
                value={editForm.dueDate}
                onChange={(value) => setEditForm((f) => ({ ...f, dueDate: value }))}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Departments
              </span>
              <div className="grid grid-cols-2 gap-2">
                {departments.map((dept) => (
                  <label
                    key={dept.id}
                    className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={editForm.departmentIds.includes(dept.id)}
                      onChange={() => toggleEditDepartment(dept.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-foreground">{dept.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowEditProject(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleEditProject}
              disabled={!editForm.name.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </Dlg>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <Dlg title="Delete project" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                Are you sure you want to delete this project? This will also delete all tasks and subtasks in this project. This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {/* Close Project Dialog */}
      {showCloseDialog && (() => {
        const validationChecks = getCloseValidationChecks();
        return (
          <Dlg title="Close Project" onClose={() => setShowCloseDialog(false)}>
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Closing this project will mark it as completed and archive it. You can reopen it later if needed.
              </p>
              
              {/* Validation Checklist */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  {validationChecks.allTasksCompleted.passed ? (
                    <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-500 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${validationChecks.allTasksCompleted.passed ? 'text-foreground' : 'text-red-600'}`}>
                    {validationChecks.allTasksCompleted.label}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  {validationChecks.noPendingReviews.passed ? (
                    <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${validationChecks.noPendingReviews.passed ? 'text-foreground' : 'text-amber-600'}`}>
                    {validationChecks.noPendingReviews.label}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  {validationChecks.noOverdueItems.passed ? (
                    <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Clock size={18} className="text-red-500 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${validationChecks.noOverdueItems.passed ? 'text-foreground' : 'text-red-600'}`}>
                    {validationChecks.noOverdueItems.label}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Closing Notes (optional)</label>
                <textarea
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Add any notes about why this project is being closed..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[100px] resize-y"
                  rows={4}
                />
              </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCloseDialog(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseProject}
                disabled={!validationChecks.canClose}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close Project
              </button>
            </div>
          </div>
        </Dlg>
        );
      })()}

      {/* Reopen Project Dialog */}
      {showReopenDialog && (
        <Dlg title="Reopen Project" onClose={() => setShowReopenDialog(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Reopening this project will make it active again. Please provide a reason for reopening.
            </p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reason for reopening</label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Explain why this project needs to be reopened..."
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[100px] resize-y"
                rows={4}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReopenDialog(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleReopenProject}
                disabled={!reopenReason.trim()}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reopen Project
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </>
  );
}