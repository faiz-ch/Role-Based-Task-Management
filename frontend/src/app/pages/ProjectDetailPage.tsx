import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Plus, Users, UserCheck, Edit2, Trash2 } from "lucide-react";
import { Project, UserType, Department, Task } from "../types";
import { getProject, updateProjectTeam, getProjectCandidates, updateProject, deleteProject, sendProjectForApproval, approveProject, rejectProject } from "../api/projects";
import { getTasks, createTask, updateTaskTeam } from "../api/tasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { getProjectReports, createProjectReport, Report } from "../api/reports";
import { useAuth } from "../context/AuthContext";
import { Dlg } from "../components/Dlg";
import { FldSelect } from "../components/FldSelect";
import { Av } from "../components/Av";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";

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
  const [users, setUsers] = useState<UserType[]>([]);
  const [candidates, setCandidates] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showManageTeam, setShowManageTeam] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [taskTeamSearch, setTaskTeamSearch] = useState("");
  const [projectTeamSearch, setProjectTeamSearch] = useState("");
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    assigneeId: null as number | null,
    selectedTeamIds: [] as number[],
    selectedLeadId: "" as string,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    departmentIds: [] as number[],
  });

  const canManage = permissions.includes("project:manage") && (
    currentUser?.role?.allDepartments ||
    (project?.departmentIds && currentUser?.role?.departments?.some(d => project.departmentIds.includes(d.id)))
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
        const [projectResult, tasksResult, usersResult, departmentsResult, candidatesResult, reportsResult] = await Promise.allSettled([
          getProject(Number(projectId)),
          getTasks(),
          getUsers(),
          getDepartments(),
          getProjectCandidates(Number(projectId)),
          getProjectReports(Number(projectId)),
        ]);

        setProject(projectResult.status === "fulfilled" ? projectResult.value : null);
        setTasks(tasksResult.status === "fulfilled" ? tasksResult.value : []);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
        setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);
        setCandidates(candidatesResult.status === "fulfilled" ? candidatesResult.value : []);
        setReports(reportsResult.status === "fulfilled" ? reportsResult.value : []);

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

  async function handleManageTeam() {
    if (!project) return;
    try {
      setError(null);
      const updated = await updateProjectTeam(
        project.id,
        selectedTeamIds,
        selectedLeadId ? Number(selectedLeadId) : undefined
      );
      setProject(updated);
      setShowManageTeam(false);
      setSelectedTeamIds([]);
      setSelectedLeadId("");
    } catch (err: any) {
      setError(err?.message || "Failed to update team");
    }
  }

  async function handleCreateTask() {
    if (!project || !taskForm.title.trim()) return;
    try {
      setError(null);
      const taskData: any = {
        title: taskForm.title.trim(),
        description: taskForm.description,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate,
        projectId: project.id,
        assigneeId: taskForm.assigneeId,
      };
      const newTask = await createTask(taskData);
      setTasks((prev) => [...prev, newTask]);

      // If team members were selected, update the task team
      if (taskForm.selectedTeamIds.length > 0) {
        try {
          await updateTaskTeam(
            newTask.id,
            taskForm.selectedTeamIds,
            taskForm.selectedLeadId ? Number(taskForm.selectedLeadId) : undefined
          );
        } catch (teamErr: any) {
          setError(teamErr?.message || "Task created but failed to set team");
        }
      }

      setShowNewTask(false);
      setTaskForm({
        title: "",
        description: "",
        priority: "Medium",
        dueDate: "",
        assigneeId: null,
        selectedTeamIds: [],
        selectedLeadId: "",
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create task");
    }
  }

  async function handleEditProject() {
    if (!project || !editForm.name.trim()) return;
    try {
      setError(null);
      const updated = await updateProject(project.id, {
        name: editForm.name.trim(),
        description: editForm.description,
        priority: editForm.priority,
        dueDate: editForm.dueDate,
        departmentIds: editForm.departmentIds,
      });
      setProject(updated);
      setShowEditProject(false);
    } catch (err: any) {
      setError(err?.message || "Failed to update project");
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

  function toggleEditDepartment(deptId: number) {
    setEditForm((prev) => ({
      ...prev,
      departmentIds: prev.departmentIds.includes(deptId)
        ? prev.departmentIds.filter((id) => id !== deptId)
        : [...prev.departmentIds, deptId],
    }));
  }

  function toggleTeamMember(userId: number) {
    setSelectedTeamIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function toggleTaskTeamMember(userId: number) {
    setTaskForm((prev) => {
      const newTeamIds = prev.selectedTeamIds.includes(userId)
        ? prev.selectedTeamIds.filter((id) => id !== userId)
        : [...prev.selectedTeamIds, userId];
      
      // If user unchecks the current assignee (who is also the lead), reset both
      if (prev.assigneeId === userId && prev.selectedLeadId === userId.toString()) {
        return {
          ...prev,
          selectedTeamIds: newTeamIds,
          assigneeId: null,
          selectedLeadId: "",
        };
      }
      
      return { ...prev, selectedTeamIds: newTeamIds };
    });
  }

  function openNewTask() {
    setTaskForm({
      title: "",
      description: "",
      priority: "Medium",
      dueDate: "",
      assigneeId: null,
      selectedTeamIds: [],
      selectedLeadId: "",
    });
    setShowNewTask(true);
  }

  function openEditProject() {
    if (!project) return;
    setEditForm({
      name: project.name,
      description: project.description,
      priority: project.priority,
      dueDate: project.dueDate,
      departmentIds: project.departmentIds,
    });
    setShowEditProject(true);
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

      <div className="flex gap-6">
        <div className="flex-1 space-y-4">
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
                <ProjectStatusBadge status={project.status} />
                <PriBadge priority={project.priority} />
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <>
                    <button
                      onClick={openEditProject}
                      className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                      title="Edit project"
                    >
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
            {projectTasks.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Progress</span>
                  <span className="text-xs text-muted-foreground">
                    {projectTasks.filter((t) => t.status === "Done").length} of {projectTasks.length} tasks done · {Math.round((projectTasks.filter((t) => t.status === "Done").length / projectTasks.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{
                      width: `${Math.round((projectTasks.filter((t) => t.status === "Done").length / projectTasks.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
              {(canManage || currentUser?.id === project?.leadId) && (
                <button
                  onClick={openNewTask}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                >
                  <Plus size={12} /> New Task
                </button>
              )}
            </div>
            {projectTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No tasks yet
              </div>
            ) : (
              <div className="space-y-2">
                {projectTasks.map((task) => {
                  return (
                    <div
                      key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={task.status} />
                          <PriBadge priority={task.priority} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
        </div>

        <div className="w-72 space-y-4">
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Lead</span>
                <div className="flex items-center gap-2 mt-1">
                  {lead ? (
                    <>
                      <Av name={lead.name} size="sm" />
                      <span className="text-sm text-foreground">{lead.name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</span>
                <p className="text-sm text-foreground mt-1">{fmtDate(project.dueDate)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Departments</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {projectDepts.map((d) => (
                    <span key={d.id} className="px-1.5 py-0.5 bg-muted rounded text-xs">
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Team</h2>
              {canManage && (
                <button
                  onClick={() => {
                    setSelectedTeamIds(project.teamUserIds);
                    setSelectedLeadId(project.leadId?.toString() || "");
                    setShowManageTeam(true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  Manage
                </button>
              )}
            </div>
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members</p>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-2">
                    <Av name={member.name} size="sm" />
                    <span className="text-sm text-foreground">{member.name}</span>
                    {member.id === project.leadId && (
                      <span className="text-xs text-muted-foreground">(Lead)</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {project.teamApprovedAt && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <UserCheck size={12} />
                  <span>Team approved</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtDate(project.teamApprovedAt)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewTask && (
        <Dlg title="New Task" onClose={() => setShowNewTask(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due Date</label>
                <input
                  type="datetime-local"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Task Team
              </span>
              <input
                type="text"
                placeholder="Search team members..."
                value={taskTeamSearch}
                onChange={(e) => setTaskTeamSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 mb-2"
              />
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No team members in this project. Add team members first.
                  </p>
                ) : (
                  teamMembers
                    .filter((member) => member.name.toLowerCase().includes(taskTeamSearch.toLowerCase()))
                    .map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={taskForm.selectedTeamIds.includes(member.id)}
                        onChange={() => toggleTaskTeamMember(member.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={member.name} size="sm" />
                      <span className="text-sm text-foreground">{member.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {taskForm.selectedTeamIds.length > 0 && (
              <FldSelect
                label="Select Task Lead"
                value={taskForm.selectedLeadId}
                onChange={(e) => {
                  const leadId = e.target.value;
                  const leadIdNum = leadId === "" ? null : Number(leadId);
                  setTaskForm((prev) => ({
                    ...prev,
                    selectedLeadId: leadId,
                    assigneeId: leadIdNum,
                    selectedTeamIds: leadIdNum && !prev.selectedTeamIds.includes(leadIdNum)
                      ? [...prev.selectedTeamIds, leadIdNum]
                      : prev.selectedTeamIds,
                  }));
                }}
                options={[
                  { value: "", label: "Select lead" },
                  ...teamMembers
                    .filter((u) => taskForm.selectedTeamIds.includes(u.id))
                    .map((u) => ({ value: u.id.toString(), label: u.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowNewTask(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTask}
              disabled={!taskForm.title.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Task
            </button>
          </div>
        </Dlg>
      )}

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
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due Date</label>
                <input
                  type="datetime-local"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                />
              </div>
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

      {showDeleteConfirm && (
        <Dlg title="Delete project" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete this project? This will also delete all tasks and subtasks in this project. This action cannot be undone.
            </p>
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

      {showManageTeam && (
        <Dlg title="Manage Project Team" onClose={() => setShowManageTeam(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Team Members
              </span>
              <input
                type="text"
                placeholder="Search team members..."
                value={projectTeamSearch}
                onChange={(e) => setProjectTeamSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 mb-2"
              />
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No eligible users in this project's departments. Add users to one of the project's departments first.
                  </p>
                ) : (
                  candidates
                    .filter((user) => user.name.toLowerCase().includes(projectTeamSearch.toLowerCase()))
                    .map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(user.id)}
                        onChange={() => toggleTeamMember(user.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={user.name} size="sm" />
                      <span className="text-sm text-foreground">{user.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {selectedTeamIds.length > 0 && (
              <FldSelect
                label="Select Lead"
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                options={[
                  { value: "", label: "Select lead" },
                  ...candidates
                    .filter((u) => selectedTeamIds.includes(u.id))
                    .map((u) => ({ value: u.id.toString(), label: u.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowManageTeam(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleManageTeam}
              disabled={selectedTeamIds.length === 0}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Team
            </button>
          </div>
        </Dlg>
      )}
    </div>
  );
}
