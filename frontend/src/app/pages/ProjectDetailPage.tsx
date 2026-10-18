import React, { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Video } from "lucide-react";
import { Project, UserType, Department, Task, Subtask, Milestone, Attachment } from "../types";
import { getProject, updateProjectTeam, getProjectCandidates, updateProject, deleteProject, sendProjectForApproval, approveProject, rejectProject, closeProject, reopenProject, getProjectMilestones, createMilestone, updateMilestone, deleteMilestone, getProjectAttachments, uploadProjectAttachment, deleteAttachment, getAttachmentDownloadUrl, getProjectActivity } from "../api/projects";
import { getTasks, createTask, updateTaskTeam } from "../api/tasks";
import { getDepartments } from "../api/departments";
import { useCachedQuery, qk, FRESH, EMPTY } from "../api/queries";
import { getProjectReports, createProjectReport, Report } from "../api/reports";
import { createMeeting } from "../api/meetings";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";
import { OverviewTab } from "./project-detail/OverviewTab";
import { TasksTab } from "./project-detail/TasksTab";
import { MilestonesTab } from "./project-detail/MilestonesTab";
import { MeetingsTab } from "./project-detail/MeetingsTab";
import { TeamTab } from "./project-detail/TeamTab";
import { TimelineTab } from "./project-detail/TimelineTab";
import { FilesTab } from "./project-detail/FilesTab";
import { ActivityTab } from "./project-detail/ActivityTab";
import { SettingsTab } from "./project-detail/SettingsTab";
import { ScheduleMeetingDialog } from "./project-detail/ScheduleMeetingDialog";
import { inDepartmentScope } from "../utils/roleAccess";

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
  const pid = Number(projectId);
  const hasId = !!projectId && !Number.isNaN(pid);

  // Everything comes from the shared store. Each part refreshes itself after
  // any save (see api/client.ts), so Activity, team and counts stay current.
  const projectQ = useCachedQuery<Project | null>(qk.project(pid), () => getProject(pid), null, { enabled: hasId, staleTime: FRESH.LIVE });
  const tasksQ = useCachedQuery<Task[]>(qk.tasks({ projectId: pid }), () => getTasks({ projectId: pid }), EMPTY, { enabled: hasId, staleTime: FRESH.LIVE });
  const departmentsQ = useCachedQuery<Department[]>(qk.departments, getDepartments, EMPTY, { staleTime: FRESH.RARE });
  const candidatesQ = useCachedQuery<UserType[]>([...qk.project(pid), "candidates"], () => getProjectCandidates(pid), EMPTY, { enabled: hasId });
  const reportsQ = useCachedQuery<Report[]>([...qk.project(pid), "reports"], () => getProjectReports(pid), EMPTY, { enabled: hasId });
  const milestonesQ = useCachedQuery<Milestone[]>([...qk.project(pid), "milestones"], () => getProjectMilestones(pid), EMPTY, { enabled: hasId });
  const attachmentsQ = useCachedQuery<Attachment[]>([...qk.project(pid), "attachments"], () => getProjectAttachments(pid), EMPTY, { enabled: hasId });
  const activityQ = useCachedQuery<any[]>([...qk.project(pid), "activity"], () => getProjectActivity(pid), EMPTY, { enabled: hasId, staleTime: FRESH.LIVE });

  const project = projectQ.data;
  const setProject = projectQ.setData;
  const tasks = tasksQ.data;
  const setTasks = tasksQ.setData;
  const [subtasks] = useState<Subtask[]>([]);
  const candidates = candidatesQ.data;
  const departments = departmentsQ.data;
  const reports = reportsQ.data;
  const setReports = reportsQ.setData;
  const milestones = milestonesQ.data;
  const setMilestones = milestonesQ.setData;
  const attachments = attachmentsQ.data;
  const setAttachments = attachmentsQ.setData;
  const activity = activityQ.data;
  const loading = projectQ.isLoading;
  const [actionError, setError] = useState<string | null>(null);
  const error = !hasId
    ? "Project ID is required"
    : actionError || (projectQ.error ? projectQ.error.message || "Failed to load project." : null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  // Department scope lives on the user (manageAllDepartments / managedDepartments)
  const canManage = permissions.includes("project:manage") && inDepartmentScope(currentUser, project?.departmentIds);
  const isLead = currentUser?.id === project?.leadId;
  const canScheduleMeeting = canManage || isLead;


  const projectTasks = tasks.filter((t) => t.projectId === Number(projectId));
  const projectDepts = departments.filter((d) => project?.departmentIds.includes(d.id));
  const teamMembers = candidates.filter((u) => project?.teamUserIds.includes(u.id));
  const lead = teamMembers.find((u) => u.id === project?.leadId);

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

  async function handleCreateReport(content: string) {
    if (!project || !content.trim()) return;
    try {
      setError(null);
      const newReport = await createProjectReport(project.id, { content: content.trim() });
      setReports([newReport]);
      // Refetch project to pick up possibly-updated status
      const updatedProject = await getProject(project.id);
      setProject(updatedProject);
    } catch (err: any) {
      setError(err?.message || "Failed to save report");
      throw err;
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
      throw err;
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
      throw err;
    }
  }

  async function handleReject(reason: string) {
    if (!project || !reason.trim()) return;
    try {
      setError(null);
      const updated = await rejectProject(project.id, reason.trim());
      setProject(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to reject project");
      throw err;
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

  async function handleCreateMeeting(meetingData: any) {
    if (!project) return;
    try {
      setError(null);
      await createMeeting(project.id, meetingData);
      // Switch to Meetings tab and trigger refresh
      setActiveTab("meetings");
    } catch (err: any) {
      setError(err?.message || "Failed to create meeting");
      throw err;
    }
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
    { id: "meetings", label: "Meetings" },
    { id: "team", label: "Team" },
    { id: "timeline", label: "Timeline" },
    { id: "files", label: "Files" },
    { id: "activity", label: "Activity" },
    ...(permissions.includes("project:manage") ? [{ id: "settings", label: "Settings" }] : []),
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
          {canScheduleMeeting && project.status !== "Done" && project.status !== "Archived" && (
            <button
              onClick={() => setShowScheduleDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              <Video size={12} />
              Schedule meeting
            </button>
          )}
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
          reports={reports}
          canManage={canManage}
          onCreateReport={handleCreateReport}
          onSendForApproval={handleSendForApproval}
          onApprove={handleApprove}
          onReject={handleReject}
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

      {activeTab === "meetings" && (
        <MeetingsTab
          projectId={project.id}
          canScheduleMeeting={canScheduleMeeting}
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

      {activeTab === "settings" && permissions.includes("project:manage") && (
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

      {showScheduleDialog && (
        <ScheduleMeetingDialog
          project={project}
          teamMembers={teamMembers}
          currentUser={currentUser}
          onClose={() => setShowScheduleDialog(false)}
          onCreateMeeting={handleCreateMeeting}
          setError={setError}
        />
      )}
    </div>
  );
}