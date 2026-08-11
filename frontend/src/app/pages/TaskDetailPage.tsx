import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Plus, Image, FileText, X, Trash2, Users, Edit2, Paperclip, MessageCircle, MoreVertical, ChevronRight, Calendar, User, Clock, BarChart3, Download } from "lucide-react";
import { Task, UserType, Department, Project, Subtask } from "../types";
import { getTask, updateTaskStatus, updateTaskTeam, updateTask, deleteTask } from "../api/tasks";
import { getSubtasks, createSubtask, updateSubtask, updateSubtaskStatus, updateSubtaskAssignees, deleteSubtask } from "../api/subtasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { getProject, getProjectCandidates } from "../api/projects";
import { uploadAttachment, getAttachments, getAttachmentDownloadUrl, fetchAttachmentBlobUrl, fetchAttachmentPreviewBlobUrl, deleteAttachment, Attachment } from "../api/attachments";
import { getTaskReports, createTaskReport, Report, getSubtaskReports } from "../api/reports";
import { getSubtaskAttachments } from "../api/attachments";
import { getTaskComments, Comment } from "../api/comments";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";
import { Dlg } from "../components/Dlg";
import { Av } from "../components/Av";
import { DatePicker } from "../components/DatePicker";

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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { currentUser, permissions } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [candidates, setCandidates] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: number; url: string; filename: string; isImage: boolean } | null>(null);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showApproveComment, setShowApproveComment] = useState(true);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [approveComment, setApproveComment] = useState("");
  const [rescheduleComment, setRescheduleComment] = useState("");
  const [showNewSubtask, setShowNewSubtask] = useState(false);
  const [showEditTask, setShowEditTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [subtaskReports, setSubtaskReports] = useState<Record<number, Report[]>>({});
  const [subtaskAttachments, setSubtaskAttachments] = useState<Record<number, Attachment[]>>({});
  const [editTaskForm, setEditTaskForm] = useState({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
  });
  const [editSubtask, setEditSubtask] = useState<Subtask | null>(null);
  const [showReassignSubtask, setShowReassignSubtask] = useState<Subtask | null>(null);
  const [reassignUserIds, setReassignUserIds] = useState<number[]>([]);
  const [showSubtaskApproveDialog, setShowSubtaskApproveDialog] = useState<Subtask | null>(null);
  const [subtaskApproveComment, setSubtaskApproveComment] = useState("");
  const [showSubtaskRescheduleDialog, setShowSubtaskRescheduleDialog] = useState<Subtask | null>(null);
  const [subtaskRescheduleComment, setSubtaskRescheduleComment] = useState("");
  const [teamMemberSearch, setTeamMemberSearch] = useState("");
  const [subtaskAssigneeSearch, setSubtaskAssigneeSearch] = useState("");
  const [reassignUserSearch, setReassignUserSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "subtasks" | "team" | "files" | "activity">("overview");
  const [subtaskForm, setSubtaskForm] = useState({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
    assigneeIds: [] as number[],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadData() {
      if (!taskId) {
        setError("Task ID is required");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const [taskResult, usersResult, departmentsResult, candidatesResult, subtasksResult, attachmentsResult, reportsResult, commentsResult] = await Promise.allSettled([
          getTask(Number(taskId)),
          getUsers(),
          getDepartments(),
          getProjectCandidates(Number(taskId)),
          getSubtasks(),
          getAttachments(Number(taskId)),
          getTaskReports(Number(taskId)),
          getTaskComments(Number(taskId)),
        ]);

        const loadedTask = taskResult.status === "fulfilled" ? taskResult.value : null;
        setTask(loadedTask);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
        setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);
        setCandidates(candidatesResult.status === "fulfilled" ? candidatesResult.value : []);
        setSubtasks(subtasksResult.status === "fulfilled" ? subtasksResult.value : []);
        setAttachments(attachmentsResult.status === "fulfilled" ? attachmentsResult.value : []);
        setReports(reportsResult.status === "fulfilled" ? reportsResult.value : []);
        setComments(commentsResult.status === "fulfilled" ? commentsResult.value : []);

        if (loadedTask?.projectId) {
          const projectResult = await getProject(loadedTask.projectId);
          setProject(projectResult);
        }

        if (taskResult.status === "rejected") {
          setError((taskResult.reason as any)?.message || "Failed to load task.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [taskId]);

  // Load subtask-specific data when subtasks are loaded
  useEffect(() => {
    async function loadSubtaskData() {
      if (subtasks.length === 0) return;
      
      const reportsData: Record<number, Report[]> = {};
      const attachmentsData: Record<number, Attachment[]> = {};

      await Promise.all(
        subtasks.map(async (subtask) => {
          try {
            const [reportsResult, attachmentsResult] = await Promise.allSettled([
              getSubtaskReports(subtask.id),
              getSubtaskAttachments(subtask.id),
            ]);
            reportsData[subtask.id] = reportsResult.status === "fulfilled" ? reportsResult.value : [];
            attachmentsData[subtask.id] = attachmentsResult.status === "fulfilled" ? attachmentsResult.value : [];
          } catch (err) {
            console.error(`Failed to load data for subtask ${subtask.id}:`, err);
            reportsData[subtask.id] = [];
            attachmentsData[subtask.id] = [];
          }
        })
      );

      setSubtaskReports(reportsData);
      setSubtaskAttachments(attachmentsData);
    }
    loadSubtaskData();
  }, [subtasks]);

  const taskLead = users.find((u) => u.id === task?.leadId);
  const teamMembers = candidates.filter((u) => task?.teamUserIds.includes(u.id));
  const projectDepts = departments.filter((d) => project?.departmentIds.includes(d.id));

  const canManage = permissions.includes("project:manage") && (
    currentUser?.role?.allDepartments ||
    (project?.departmentIds && currentUser?.role?.departments?.some(d => project.departmentIds.includes(d.id)))
  );

  function canManageTask(): boolean {
    if (!task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId
    );
  }

  function isTaskLead(): boolean {
    return currentUser?.id === task?.leadId;
  }

  function isTaskAssignee(): boolean {
    return currentUser?.id === task?.assigneeId;
  }

  function getTaskProgress(): number {
    if (subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.status === "Done").length;
    return Math.round((completed / subtasks.length) * 100);
  }

  async function handleManageTeam() {
    if (!task) return;
    try {
      setError(null);
      const updated = await updateTaskTeam(
        task.id,
        selectedTeamIds,
        selectedLeadId ? Number(selectedLeadId) : undefined
      );
      setTask(updated);
      setShowManageTeam(false);
      setSelectedTeamIds([]);
      setSelectedLeadId("");
    } catch (err: any) {
      setError(err?.message || "Failed to update team");
    }
  }

  async function handleCreateSubtask() {
    if (!task || !subtaskForm.title.trim()) return;
    try {
      setError(null);
      const newSubtask = await createSubtask(task.id, {
        title: subtaskForm.title.trim(),
        description: subtaskForm.description,
        priority: subtaskForm.priority,
        dueDate: subtaskForm.dueDate,
        assigneeIds: subtaskForm.assigneeIds,
      });
      setSubtasks((prev) => [...prev, newSubtask]);
      setShowNewSubtask(false);
      setSubtaskForm({ title: "", description: "", priority: "Medium", dueDate: "", assigneeIds: [] });
    } catch (err: any) {
      setError(err?.message || "Failed to create subtask");
    }
  }

  async function handleEditTask() {
    if (!task || !editTaskForm.title.trim()) return;
    try {
      setError(null);
      const updated = await updateTask(task.id, {
        title: editTaskForm.title.trim(),
        description: editTaskForm.description,
        priority: editTaskForm.priority,
        dueDate: editTaskForm.dueDate,
      });
      setTask(updated);
      setShowEditTask(false);
    } catch (err: any) {
      setError(err?.message || "Failed to update task");
    }
  }

  async function handleDeleteTask() {
    if (!task) return;
    try {
      setError(null);
      await deleteTask(task.id);
      navigate("/tasks");
    } catch (err: any) {
      setError(err?.message || "Failed to delete task");
    }
  }

  async function handleReschedule() {
    if (!task || !rescheduleDate || !rescheduleComment.trim()) return;
    try {
      setRescheduleLoading(true);
      setError(null);
      await updateTaskStatus(task.id, { status: "Reschedule", comment: rescheduleComment.trim() });
      const updated = await getTask(task.id);
      setTask(updated);
      setShowReschedule(false);
      setRescheduleDate("");
      setRescheduleComment("");
    } catch (err: any) {
      setError(err?.message || "Failed to reschedule task");
    } finally {
      setRescheduleLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
      setUploading(true);
      setError(null);
      const uploaded = await uploadAttachment(Number(taskId), file);
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      setError(err?.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteAttachment(attachmentId: number) {
    try {
      setError(null);
      await deleteAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete attachment");
    }
  }

  async function handleCreateReport() {
    if (!task || !reportContent.trim()) return;
    try {
      setError(null);
      const newReport = await createTaskReport(task.id, { content: reportContent.trim() });
      setReports([newReport, ...reports]);
      setReportContent("");
      setShowNewReport(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create report");
    }
  }

  function getSubtaskStatusCounts() {
    const total = subtasks.length;
    const toDo = subtasks.filter(s => s.status === "To Do").length;
    const review = subtasks.filter(s => s.status === "Review").length;
    const done = subtasks.filter(s => s.status === "Done").length;
    const reschedule = subtasks.filter(s => s.status === "Reschedule").length;
    return { total, toDo, review, done, reschedule };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading task...</span>
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

  if (!task) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-muted-foreground">Task not found</span>
      </div>
    );
  }

  const progress = getTaskProgress();
  const statusCounts = getSubtaskStatusCounts();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <button 
            onClick={() => navigate("/projects")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Projects
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          {project && (
            <>
              <button 
                onClick={() => navigate(`/projects/${project.id}`)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {project.name}
              </button>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </>
          )}
          <button 
            onClick={() => navigate("/tasks")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Tasks
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium">{task.title}</span>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
              <StatusBadge status={task.status} />
            </div>
            {project && (
              <p className="text-sm text-muted-foreground">{project.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditTaskForm({
                  title: task.title,
                  description: task.description,
                  priority: task.priority,
                  dueDate: task.dueDate,
                });
                setShowEditTask(true);
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              <Edit2 className="w-4 h-4" />
              Edit Task
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Key Facts Row */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Task Lead</p>
              <p className="text-sm font-medium text-foreground">{taskLead?.name || "Unassigned"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <PriBadge priority={task.priority} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="text-sm font-medium text-foreground">{fmtDate(task.dueDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-sm font-medium text-foreground">{progress}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-border px-6">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("subtasks")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "subtasks"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Subtasks ({subtasks.length})
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "team"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Team ({teamMembers.length})
          </button>
          <button
            onClick={() => setActiveTab("files")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "files"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Files ({attachments.length})
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "activity"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Activity
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 gap-6">
            {/* Description */}
            <div className="bg-white rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Description</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {task.description || "No description provided"}
              </p>
            </div>

            {/* Attachments */}
            <div className="bg-white rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Attachments</h2>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No attachments yet</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {attachment.filename.toLowerCase().endsWith(('.png', '.jpg', '.jpeg', '.gif', '.webp')) ? (
                          <Image className="w-8 h-8 text-muted-foreground" />
                        ) : (
                          <FileText className="w-8 h-8 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{attachment.filename}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const url = await getAttachmentDownloadUrl(attachment.id);
                              window.open(url, '_blank');
                            } catch (err) {
                              setError("Failed to download attachment");
                            }
                          }}
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="p-2 text-red-600 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "subtasks" && (
          <div className="bg-white rounded-xl border border-border">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Subtasks</h2>
                <button
                  onClick={() => setShowNewSubtask(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Subtask
                </button>
              </div>
            </div>

            {/* Subtask Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subtask</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {subtasks.map((subtask) => (
                    <tr key={subtask.id} className="border-b border-border hover:bg-muted transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-foreground">{subtask.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {subtask.assigneeIds.map((assigneeId) => {
                            const assignee = users.find((u) => u.id === assigneeId);
                            return assignee ? (
                              <Av key={assignee.id} name={assignee.name} size="sm" />
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-muted-foreground">{fmtDate(subtask.dueDate)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={subtask.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${subtask.status === "Done" ? 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{subtask.status === "Done" ? "100%" : "0%"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="p-6 border-t border-border bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Subtasks</p>
                    <p className="text-lg font-semibold text-foreground">{statusCounts.total}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">To Do</p>
                    <p className="text-lg font-semibold text-gray-600">{statusCounts.toDo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Review</p>
                    <p className="text-lg font-semibold text-blue-600">{statusCounts.review}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Done</p>
                    <p className="text-lg font-semibold text-green-600">{statusCounts.done}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reschedule</p>
                    <p className="text-lg font-semibold text-orange-600">{statusCounts.reschedule}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overall Progress</p>
                  <p className="text-lg font-semibold text-foreground">{progress}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "team" && (
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
              <button
                onClick={() => {
                  const teamIds = [...(task?.teamUserIds || [])];
                  setSelectedTeamIds(teamIds);
                  setSelectedLeadId(task?.leadId?.toString() || "");
                  setShowManageTeam(true);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <Users className="w-4 h-4" />
                Manage Team
              </button>
            </div>
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No team members assigned</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-4 border border-border rounded-lg"
                  >
                    <Av name={member.name} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      {member.id === task.leadId && (
                        <p className="text-xs text-muted-foreground">Task Lead</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Files</h2>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No files uploaded yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {attachment.filename.toLowerCase().endsWith(('.png', '.jpg', '.jpeg', '.gif', '.webp')) ? (
                        <Image className="w-8 h-8 text-muted-foreground" />
                      ) : (
                        <FileText className="w-8 h-8 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{attachment.filename}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const url = await getAttachmentDownloadUrl(attachment.id);
                            window.open(url, '_blank');
                          } catch (err) {
                            setError("Failed to download file");
                          }
                        }}
                        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAttachment(attachment.id)}
                        className="p-2 text-red-600 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Activity</h2>
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => {
                  const author = users.find((u) => u.id === comment.authorId);
                  return (
                    <div key={comment.id} className="flex gap-3 pb-4 border-b border-border last:border-0">
                      <Av name={author?.name || "Unknown"} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-foreground">{author?.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(comment.createdAt)}</p>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showNewSubtask && (
        <Dlg title="New Subtask" onClose={() => setShowNewSubtask(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={subtaskForm.title}
                onChange={(e) => setSubtaskForm({ ...subtaskForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={subtaskForm.description}
                onChange={(e) => setSubtaskForm({ ...subtaskForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                <select
                  value={subtaskForm.priority}
                  onChange={(e) => setSubtaskForm({ ...subtaskForm, priority: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <DatePicker
                label="Due Date"
                value={subtaskForm.dueDate}
                onChange={(value) => setSubtaskForm({ ...subtaskForm, dueDate: value })}
                min={new Date().toISOString().slice(0, 16)}
                max={task?.dueDate ? task.dueDate.slice(0, 16) : undefined}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Assignees</label>
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <label key={member.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={subtaskForm.assigneeIds.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSubtaskForm({ ...subtaskForm, assigneeIds: [...subtaskForm.assigneeIds, member.id] });
                        } else {
                          setSubtaskForm({ ...subtaskForm, assigneeIds: subtaskForm.assigneeIds.filter(id => id !== member.id) });
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-foreground">{member.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowNewSubtask(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateSubtask}
              disabled={!subtaskForm.title.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Subtask
            </button>
          </div>
        </Dlg>
      )}

      {showEditTask && (
        <Dlg title="Edit Task" onClose={() => setShowEditTask(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={editTaskForm.title}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={editTaskForm.description}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                <select
                  value={editTaskForm.priority}
                  onChange={(e) => setEditTaskForm({ ...editTaskForm, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <DatePicker
                label="Due Date"
                value={editTaskForm.dueDate}
                onChange={(value) => setEditTaskForm({ ...editTaskForm, dueDate: value })}
                min={new Date().toISOString().slice(0, 16)}
                max={task?.projectId && project?.dueDate ? project.dueDate.slice(0, 16) : undefined}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowEditTask(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleEditTask}
              disabled={!editTaskForm.title.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </Dlg>
      )}

      {showDeleteConfirm && (
        <Dlg title="Delete task" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete this task? This will also delete all subtasks and attachments in this task. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTask}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {showManageTeam && (
        <Dlg title="Manage Team" onClose={() => setShowManageTeam(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Select Lead</label>
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
              >
                <option value="">No lead</option>
                {candidates
                  .filter((u) => u.role?.permissions?.includes("task:manage") || u.role?.permissions?.includes("task:create"))
                  .map((u) => ({ value: u.id.toString(), label: u.name }))
                  .map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Team Members</label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {candidates
                  .filter((user) => user.name.toLowerCase().includes(teamMemberSearch.toLowerCase()))
                  .map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(user.id)}
                        onChange={() => {
                          if (selectedTeamIds.includes(user.id)) {
                            setSelectedTeamIds(selectedTeamIds.filter(id => id !== user.id));
                          } else {
                            setSelectedTeamIds([...selectedTeamIds, user.id]);
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={user.name} size="sm" />
                      <span className="text-sm text-foreground">{user.name}</span>
                    </label>
                  ))}
              </div>
            </div>
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
              disabled={selectedTeamIds.length === 0 && !selectedLeadId}
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
