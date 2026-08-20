import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Project, UserType, Department, Task, Subtask, Milestone, Attachment } from "../types";
import { getProject, updateProjectTeam, getProjectCandidates, updateProject, deleteProject, sendProjectForApproval, approveProject, rejectProject, closeProject, reopenProject, getProjectMilestones, createMilestone, updateMilestone, deleteMilestone, getProjectAttachments, uploadProjectAttachment, deleteAttachment, getAttachmentDownloadUrl, getProjectActivity } from "../api/projects";
import { getTasks, createTask, updateTaskTeam } from "../api/tasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { getProjectReports, createProjectReport, Report } from "../api/reports";
import { getSubtasks } from "../api/subtasks";
import { useAuth } from "../context/AuthContext";
import { Dlg } from "../components/Dlg";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";
import { OverviewTab } from "./project-detail/OverviewTab";
import { TasksTab } from "./project-detail/TasksTab";
import { MilestonesTab } from "./project-detail/MilestonesTab";
import { TeamTab } from "./project-detail/TeamTab";
import { TimelineTab } from "./project-detail/TimelineTab";
import { FilesTab } from "./project-detail/FilesTab";
import { ActivityTab } from "./project-detail/ActivityTab";
import { SettingsTab } from "./project-detail/SettingsTab";
import { getEffectiveDepartmentIds } from "../utils/roleAccess";

const PROJECT_STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  Planning: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  Active: {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  "Pending Approval": {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  Done: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  Archived: {
    badge: "bg-gray-50 text-gray-600 border-gray-200",
    dot: "bg-gray-400",
  },
};

function ProjectStatusBadge({ status }: { status: string }) {
  const s = PROJECT_STATUS_STYLE[status];
  if (!s) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${s.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {status}
    </span>
  );
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

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentUser, permissions } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [candidates, setCandidates] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reportContent, setReportContent] = useState("");

  const effectiveDepartmentIds = getEffectiveDepartmentIds(currentUser?.role, departments);
  const canManage = permissions.includes("project:manage") && (
    currentUser?.role?.allDepartments ||
    (project?.departmentIds && project.departmentIds.some(deptId => effectiveDepartmentIds.includes(deptId)))
  );

  useEffect(() => {
    async function loadData() {
      if (!projectId) {
        setError("Project ID is required");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const [projectResult, tasksResult, subtasksResult, usersResult, departmentsResult, candidatesResult, reportsResult, milestonesResult, attachmentsResult, activityResult] = await Promise.allSettled([
          getProject(Number(projectId)),
          getTasks(),
          getSubtasks(),
          getUsers(),
          getDepartments(),
          getProjectCandidates(Number(projectId)),
          getProjectReports(Number(projectId)),
          getProjectMilestones(Number(projectId)),
          getProjectAttachments(Number(projectId)),
          getProjectActivity(Number(projectId)),
        ]);

        setProject(projectResult.status === "fulfilled" ? projectResult.value : null);
        setTasks(tasksResult.status === "fulfilled" ? tasksResult.value : []);
        setSubtasks(subtasksResult.status === "fulfilled" ? subtasksResult.value : []);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
        setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);
        setCandidates(candidatesResult.status === "fulfilled" ? candidatesResult.value : []);
        setReports(reportsResult.status === "fulfilled" ? reportsResult.value : []);
        setMilestones(milestonesResult.status === "fulfilled" ? milestonesResult.value : []);
        setAttachments(attachmentsResult.status === "fulfilled" ? attachmentsResult.value : []);
        setActivity(activityResult.status === "fulfilled" ? activityResult.value : []);

        if (reportsResult.status === "fulfilled" && reportsResult.value.length > 0) {
          setReportContent(reportsResult.value[0].content);
        }

        if (projectResult.status === "rejected") {
          setError((projectResult.reason as any)?.message || "Failed to load project.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  const projectTasks = tasks.filter((t) => t.projectId === Number(projectId));
  const projectDepts = departments.filter((d) => project?.departmentIds.includes(d.id));
  const teamMembers = candidates.filter((u) => project?.teamUserIds.includes(u.id));
  const lead = teamMembers.find((u) => u.id === project?.leadId);
  const existingReport = reports.length > 0 ? reports[0] : null;

  async function handleEditProject(projectData: any) {
    if (!project) return;
    try {
      setError(null);
      const updated = await updateProject(project.id, projectData);
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to update project");
      throw err;
    }
  }

  async function handleDeleteProject() {
    if (!project) return;
    try {
      setError(null);
      await deleteProject(project.id);
      navigate("/projects");
    } catch (err: any) {
      setError(err?.message || "Failed to delete project");
      throw err;
    }
  }

  async function handleCloseProject(closingNotes?: string) {
    if (!project) return;
    try {
      setError(null);
      const updated = await closeProject(project.id, closingNotes);
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to close project");
      throw err;
    }
  }

  async function handleReopenProject(reason: string) {
    if (!project) return;
    try {
      setError(null);
      const updated = await reopenProject(project.id, reason);
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to reopen project");
      throw err;
    }
  }

  async function handleCreateReport() {
    if (!project || !reportContent.trim()) return;
    try {
      setError(null);
      const newReport = await createProjectReport(project.id, { content: reportContent.trim() });
      setReports([newReport]);
      // Refetch project to pick up possibly-updated status
      const updatedProject = await getProject(project.id);
      setProject(updatedProject);
    } catch (err: any) {
      setError(err?.message || "Failed to save report");
    }
  }

  async function handleSendForApproval() {
    if (!project) return;
    try {
      setError(null);
      const updated = await sendProjectForApproval(project.id);
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to send for approval");
    }
  }

  async function handleApprove() {
    if (!project) return;
    try {
      setError(null);
      const updated = await approveProject(project.id);
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to approve project");
    }
  }

  async function handleReject() {
    if (!project || !rejectReason.trim()) return;
    try {
      setError(null);
      const updated = await rejectProject(project.id, rejectReason.trim());
      setProject(updated);
      setShowRejectDialog(false);
      setRejectReason("");
    } catch (err: any) {
      setError(err?.message || "Failed to reject project");
    }
  }

  // Callback functions for tabs
  async function handleCreateTask(taskData: any, teamIds: number[], leadId: string) {
    if (!project) return;
    try {
      setError(null);
      const fullTaskData = {
        ...taskData,
        projectId: project.id,
      };
      const newTask = await createTask(fullTaskData);
      setTasks((prev) => [...prev, newTask]);

      if (teamIds.length > 0) {
        try {
          await updateTaskTeam(
            newTask.id,
            teamIds,
            leadId ? Number(leadId) : undefined
          );
        } catch (teamErr: any) {
          setError(teamErr?.message || "Task created but failed to set team");
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create task");
      throw err;
    }
  }

  async function handleUpdateTeam(userIds: number[], leadId?: number) {
    if (!project) return;
    try {
      setError(null);
      const updated = await updateProjectTeam(project.id, userIds, leadId);
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to update team");
      throw err;
    }
  }

  async function handleCreateMilestone(milestoneData: any) {
    if (!project) return;
    try {
      setError(null);
      const newMilestone = await createMilestone(project.id, milestoneData);
      setMilestones((prev) => [...prev, newMilestone]);
    } catch (err: any) {
      setError(err?.message || "Failed to create milestone");
      throw err;
    }
  }

  async function handleUpdateMilestone(milestoneId: number, milestoneData: any) {
    try {
      setError(null);
      const updated = await updateMilestone(milestoneId, milestoneData);
      setMilestones((prev) => prev.map((m) => m.id === milestoneId ? updated : m));
    } catch (err: any) {
      setError(err?.message || "Failed to update milestone");
      throw err;
    }
  }

  async function handleDeleteMilestone(milestoneId: number) {
    try {
      setError(null);
      await deleteMilestone(milestoneId);
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete milestone");
      throw err;
    }
  }

  async function handleUploadAttachment(file: File) {
    if (!project) return;
    try {
      setError(null);
      const newAttachment = await uploadProjectAttachment(project.id, file);
      setAttachments((prev) => [...prev, newAttachment]);
    } catch (err: any) {
      setError(err?.message || "Failed to upload attachment");
      throw err;
    }
  }

  async function handleDeleteAttachment(attachmentId: number) {
    try {
      setError(null);
      await deleteAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete attachment");
      throw err;
    }
  }

  function handleGetDownloadUrl(attachmentId: number): string {
    return getAttachmentDownloadUrl(attachmentId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading project...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error || "Project not found"}</span>
        </div>
        <button
          onClick={() => navigate("/projects")}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
        >
          ← Back to projects
        </button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks" },
    { id: "milestones", label: "Milestones" },
    { id: "team", label: "Team" },
    { id: "timeline", label: "Timeline" },
    { id: "files", label: "Files" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back to projects
        </button>
      </div>

      {/* Project Header */}
      <div className="bg-white rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
            <PriBadge priority={project.priority} />
          </div>
        </div>
        {project.description && (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab 
          project={project} 
          tasks={projectTasks} 
          subtasks={subtasks} 
          activity={activity} 
        />
      )}

      {activeTab === "tasks" && (
        <TasksTab 
          project={project} 
          tasks={tasks} 
          teamMembers={teamMembers}
          onCreateTask={handleCreateTask}
        />
      )}

      {activeTab === "milestones" && (
        <MilestonesTab 
          project={project} 
          milestones={milestones}
          onCreateMilestone={handleCreateMilestone}
          onUpdateMilestone={handleUpdateMilestone}
          onDeleteMilestone={handleDeleteMilestone}
        />
      )}

      {activeTab === "team" && (
        <TeamTab 
          project={project} 
          teamMembers={teamMembers}
          candidates={candidates}
          onUpdateTeam={handleUpdateTeam}
        />
      )}

      {activeTab === "timeline" && (
        <TimelineTab tasks={projectTasks} />
      )}

      {activeTab === "files" && (
        <FilesTab 
          project={project} 
          attachments={attachments}
          onUploadAttachment={handleUploadAttachment}
          onDeleteAttachment={handleDeleteAttachment}
          getDownloadUrl={handleGetDownloadUrl}
        />
      )}

      {activeTab === "activity" && (
        <ActivityTab activity={activity} />
      )}

      {activeTab === "settings" && (
        <SettingsTab 
          project={project} 
          departments={departments}
          tasks={projectTasks}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProject}
          onCloseProject={handleCloseProject}
          onReopenProject={handleReopenProject}
        />
      )}

      {/* Report Section - Kept from original */}
      <div className="bg-white rounded-xl border border-border p-6 mt-6">
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