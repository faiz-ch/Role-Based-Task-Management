import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Plus, Image, FileText, X, Trash2, Users, Edit2 } from "lucide-react";
import { Task, UserType, Department, Project, Subtask } from "../types";
import { getTask, updateTaskStatus, updateTaskTeam, updateTask, deleteTask } from "../api/tasks";
import { getSubtasks, createSubtask, updateSubtask, updateSubtaskStatus, updateSubtaskAssignees, deleteSubtask } from "../api/subtasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { getProject, getProjectCandidates } from "../api/projects";
import { uploadAttachment, getAttachments, getAttachmentDownloadUrl, fetchAttachmentBlobUrl, fetchAttachmentPreviewBlobUrl, deleteAttachment, Attachment } from "../api/attachments";
import { getTaskReports, createTaskReport, Report } from "../api/reports";
import { getTaskComments, createTaskComment, Comment } from "../api/comments";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";
import { Dlg } from "../components/Dlg";
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
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [showNewSubtask, setShowNewSubtask] = useState(false);
  const [showEditTask, setShowEditTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [showNewComment, setShowNewComment] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [editTaskForm, setEditTaskForm] = useState({
    title: "",
    description: "",
    priority: "Medium",
    dueDate: "",
  });
  const [editSubtask, setEditSubtask] = useState<Subtask | null>(null);
  const [showReassignSubtask, setShowReassignSubtask] = useState<Subtask | null>(null);
  const [reassignUserIds, setReassignUserIds] = useState<number[]>([]);
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
        const [taskResult, usersResult, departmentsResult, attachmentsResult] = await Promise.allSettled([
          getTask(Number(taskId)),
          getUsers(),
          getDepartments(),
          getAttachments(Number(taskId)),
        ]);

        setTask(taskResult.status === "fulfilled" ? taskResult.value : null);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
        setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);
        setAttachments(attachmentsResult.status === "fulfilled" ? attachmentsResult.value : []);

        // Load project after task is loaded
        if (taskResult.status === "fulfilled" && taskResult.value) {
          try {
            const projectData = await getProject(taskResult.value.projectId);
            setProject(projectData);
            // Load candidates after project is loaded
            try {
              const candidatesData = await getProjectCandidates(projectData.id);
              setCandidates(candidatesData);
            } catch (err) {
              console.error("Failed to load candidates:", err);
            }
          } catch (err) {
            // Project loading failure shouldn't block the page
            console.error("Failed to load project:", err);
          }
        }

        // Load subtasks after task is loaded
        if (taskResult.status === "fulfilled" && taskResult.value) {
          try {
            const subtasksData = await getSubtasks(taskResult.value.id);
            setSubtasks(subtasksData);
          } catch (err) {
            console.error("Failed to load subtasks:", err);
          }
        }

        // Load reports after task is loaded
        if (taskResult.status === "fulfilled" && taskResult.value) {
          try {
            const reportsData = await getTaskReports(taskResult.value.id);
            setReports(reportsData);
          } catch (err) {
            console.error("Failed to load reports:", err);
          }

          try {
            const commentsData = await getTaskComments(taskResult.value.id);
            setComments(commentsData);
          } catch (err) {
            console.error("Failed to load comments:", err);
          }
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

  const teamMembers = candidates.filter((u) => task?.teamUserIds.includes(u.id));
  const taskLead = teamMembers.find((u) => u.id === task?.leadId);
  const projectLead = candidates.find((u) => u.id === project?.leadId);
  const projectTeamMembers = candidates.filter((u) => project?.teamUserIds.includes(u.id));

  const canManage = permissions.includes("project:manage");
  const isProjectLeadOrManager = canManage || currentUser?.id === project?.leadId;

  function canManageTask(): boolean {
    if (!task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId
    );
  }

  const canDeleteAttachments = canManageTask();

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !taskId) return;

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

  async function handleAttachmentClick(attachment: Attachment) {
  try {
    if (attachment.contentType.startsWith("image/")) {
      const blobUrl = await fetchAttachmentBlobUrl(attachment.id);
      setPreviewFile({ id: attachment.id, url: blobUrl, filename: attachment.filename, isImage: true });
    } else {
      const blobUrl = await fetchAttachmentPreviewBlobUrl(attachment.id);
      setPreviewFile({ id: attachment.id, url: blobUrl, filename: attachment.filename, isImage: false });
    }
  } catch (err: any) {
    setError(err?.message || "Failed to preview this file. You can still download it.");
  }
}

async function handleDownloadOriginal(attachment: { id: number; filename: string }) {
  try {
    const blobUrl = await fetchAttachmentBlobUrl(attachment.id);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = attachment.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    setError(err?.message || "Failed to download file");
  }
}

  async function handleApprove() {
    if (!task) return;
    try {
      setError(null);
      const updated = await updateTaskStatus(task.id, "Done");
      setTask(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to approve task");
    }
  }

  async function handleReschedule() {
    if (!task || !rescheduleDate) return;
    try {
      setRescheduleLoading(true);
      setError(null);
      const isoDate = new Date(rescheduleDate).toISOString();
      const updated = await updateTaskStatus(task.id, "Reschedule", isoDate);
      setTask(updated);
      setShowReschedule(false);
      setRescheduleDate("");
    } catch (err: any) {
      setError(err?.message || "Failed to reschedule task");
    } finally {
      setRescheduleLoading(false);
    }
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

  function toggleTeamMember(userId: number) {
    // Prevent unchecking the current assignee
    if (task?.assigneeId === userId && selectedTeamIds.includes(userId)) {
      return; // Don't allow removing the current assignee
    }
    setSelectedTeamIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function canManageSubtask(subtask: Subtask): boolean {
    if (!task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId ||
      subtask.assigneeIds.includes(currentUser?.id || 0)
    );
  }

  function isSubtaskAssignee(subtask: Subtask): boolean {
    return subtask.assigneeIds.includes(currentUser?.id || 0);
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

  async function handleUpdateSubtaskStatus(subtaskId: number, status: string) {
    try {
      setError(null);
      const updated = await updateSubtaskStatus(subtaskId, status);
      setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? updated : s)));
    } catch (err: any) {
      setError(err?.message || "Failed to update subtask status");
    }
  }

  async function handleDeleteSubtask(subtaskId: number) {
    try {
      setError(null);
      await deleteSubtask(subtaskId);
      setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete subtask");
    }
  }

  async function handleUpdateSubtaskAssignees(subtaskId: number, userIds: number[]) {
    try {
      setError(null);
      const updated = await updateSubtaskAssignees(subtaskId, userIds);
      setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? updated : s)));
      setShowReassignSubtask(null);
    } catch (err: any) {
      setError(err?.message || "Failed to reassign subtask");
    }
  }

  function toggleSubtaskAssignee(userId: number) {
    setSubtaskForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(userId)
        ? prev.assigneeIds.filter((id) => id !== userId)
        : [...prev.assigneeIds, userId],
    }));
  }

  function toggleReassignUser(userId: number) {
    setReassignUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleDeleteAttachment(attachmentId: number) {
    try {
      await deleteAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete attachment");
    }
  }

  async function handleSubmitForReview() {
    if (!task) return;
    try {
      setError(null);
      const updated = await updateTaskStatus(task.id, "Review");
      setTask(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to submit for review");
    }
  }

  function openEditTask() {
    if (!task) return;
    setEditTaskForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
    });
    setShowEditTask(true);
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

  async function handleCreateComment() {
    if (!task || !commentContent.trim()) return;
    try {
      setError(null);
      const newComment = await createTaskComment(task.id, { content: commentContent.trim() });
      setComments([...comments, newComment]);
      setCommentContent("");
      setShowNewComment(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create comment");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading task...</span>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error || "Task not found"}</span>
        </div>
        <button
          onClick={() => navigate("/tasks")}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
        >
          ← Back to tasks
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Back button + breadcrumb */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/tasks")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back to tasks
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 space-y-4">
          {/* Title + status */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">{task.title}</h1>
                <StatusBadge status={task.status} />
              </div>
              {isProjectLeadOrManager && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openEditTask}
                    className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Edit task"
                  >
                    <Edit2 size={14} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Delete task"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Description</h2>
            {task.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description</p>
            )}
          </div>

          {/* Attachments */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
              {canManageTask() && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Plus size={12} /> Add file
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            {attachments.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No attachments yet
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => {
                  const uploader = users.find((u) => u.id === attachment.uploadedBy);
                  return (
                    <div
                      key={attachment.id}
                      onClick={() => handleAttachmentClick(attachment)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      {attachment.contentType.startsWith("image/") ? (
                        <Image size={16} className="text-muted-foreground flex-shrink-0" />
                      ) : (
                        <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded by {uploader?.name || "Unknown"} · {formatFileSize(attachment.sizeBytes)}
                        </p>
                      </div>
                      {canDeleteAttachments && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAttachment(attachment.id);
                          }}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Delete attachment"
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subtasks */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Subtasks</h2>
              {(currentUser?.id === task?.leadId || currentUser?.id === project?.leadId || canManage) && (
                <button
                  onClick={() => setShowNewSubtask(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                >
                  <Plus size={12} /> New Subtask
                </button>
              )}
            </div>
            {subtasks.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Progress</span>
                  <span className="text-xs text-muted-foreground">
                    {subtasks.filter((s) => s.status === "Done").length} of {subtasks.length} subtasks done · {Math.round((subtasks.filter((s) => s.status === "Done").length / subtasks.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{
                      width: `${Math.round((subtasks.filter((s) => s.status === "Done").length / subtasks.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {subtasks.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No subtasks yet
              </div>
            ) : (
              <div className="space-y-2">
                {subtasks.map((subtask) => {
                  const assignees = users.filter((u) => subtask.assigneeIds.includes(u.id));
                  const canManageThis = canManageSubtask(subtask);
                  const isAssignee = isSubtaskAssignee(subtask);
                  
                  return (
                    <div
                      key={subtask.id}
                      onClick={() => navigate(`/subtasks/${subtask.id}`)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground truncate">{subtask.title}</p>
                          <StatusBadge status={subtask.status} />
                          <PriBadge priority={subtask.priority} />
                        </div>
                        {subtask.dueDate && (
                          <p className="text-xs text-muted-foreground">{fmtDate(subtask.dueDate)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {assignees.length > 0 && (
                          <div className="flex -space-x-2">
                            {assignees.slice(0, 3).map((a) => (
                              <Av key={a.id} name={a.name} size="sm" />
                            ))}
                            {assignees.length > 3 && (
                              <span className="w-7 h-7 rounded-full bg-gray-200 text-xs flex items-center justify-center text-gray-600">
                                +{assignees.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        {isAssignee && (subtask.status === "To Do" || subtask.status === "Reschedule") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateSubtaskStatus(subtask.id, "Review");
                            }}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors cursor-pointer"
                          >
                            Submit
                          </button>
                        )}
                        {canManageTask() && subtask.status === "Review" && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateSubtaskStatus(subtask.id, "Done");
                              }}
                              className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateSubtaskStatus(subtask.id, "Reschedule");
                              }}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer"
                            >
                              Send back
                            </button>
                          </div>
                        )}
                        {!isAssignee && !canManageTask() && (
                          <StatusBadge status={subtask.status} />
                        )}
                        {currentUser?.id === task?.leadId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowReassignSubtask(subtask);
                              setReassignUserIds(subtask.assigneeIds);
                            }}
                            className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                            title="Reassign"
                          >
                            <Users size={14} className="text-muted-foreground" />
                          </button>
                        )}
                        {canManageTask() && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSubtask(subtask.id);
                            }}
                            className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Delete subtask"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action area */}
          <div className="bg-white rounded-xl border border-border p-6">
            {canManageTask() && task.status === "Review" ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setShowReschedule(!showReschedule)}
                    className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Reschedule
                  </button>
                </div>
                {showReschedule && (
                  <div className="pt-3 border-t border-border">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      New Due Date
                    </label>
                    <input
                      type="datetime-local"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
                    />
                    <button
                      onClick={handleReschedule}
                      disabled={!rescheduleDate || rescheduleLoading}
                      className="mt-2 w-full px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rescheduleLoading ? "Confirming..." : "Confirm reschedule"}
                    </button>
                  </div>
                )}
              </div>
            ) : currentUser?.id === task?.assigneeId && (task.status === "To Do" || task.status === "Reschedule") ? (
              subtasks.length === 0 || subtasks.every(s => s.status === "Done") ? (
                <button
                  onClick={handleSubmitForReview}
                  className="w-full px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                >
                  Submit for review
                </button>
              ) : (
                <button
                  disabled
                  className="w-full px-4 py-2 bg-gray-300 text-gray-500 text-sm font-semibold rounded-lg cursor-not-allowed"
                  title="Cannot submit for review — all subtasks must be Done first"
                >
                  Submit for review (subtasks incomplete)
                </button>
              )
            ) : (
              <div className="text-sm text-muted-foreground text-center">
                {task.status === "Review" && "Waiting for review."}
                {task.status === "Reschedule" && "Rescheduled — waiting for team to resubmit."}
                {task.status === "Done" && "This task is complete."}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Reports</h2>
              {currentUser?.id === task?.leadId && (
                <button
                  onClick={() => setShowNewReport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                >
                  <Plus size={12} /> New Report
                </button>
              )}
            </div>
            {reports.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No reports yet
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => {
                  const author = users.find((u) => u.id === report.createdBy);
                  return (
                    <div key={report.id} className="border-b border-border pb-4:last:pb-0 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {author && <Av name={author.name} size="sm" />}
                          <span className="text-sm font-medium text-foreground">{author?.name || "Unknown"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{fmtDate(report.createdAt)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Comments</h2>
              <button
                onClick={() => setShowNewComment(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                <Plus size={12} /> New Comment
              </button>
            </div>
            {showNewComment && (
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full p-2 border border-border rounded-lg text-sm resize-none"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreateComment}
                    disabled={!commentContent.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Post Comment
                  </button>
                  <button
                    onClick={() => {
                      setShowNewComment(false);
                      setCommentContent("");
                    }}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {comments.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No comments yet
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => {
                  const author = users.find((u) => u.id === comment.authorId);
                  return (
                    <div key={comment.id} className="border-b border-border pb-4:last:pb-0 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {author && <Av name={author.name} size="sm" />}
                          <span className="text-sm font-medium text-foreground">{author?.name || "Unknown"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{fmtDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 space-y-4">
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Priority</span>
                <div className="mt-1">
                  <PriBadge priority={task.priority} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</span>
                <p className="text-sm text-foreground mt-1">{fmtDate(task.dueDate)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Project</span>
                <p className="text-sm text-foreground mt-1">
                  {project ? project.name : "None"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Task Lead</span>
                <p className="text-sm text-foreground mt-1">
                  {taskLead ? taskLead.name : "Unassigned"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Task Team</span>
                <div className="mt-1">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No team members</p>
                  ) : (
                    <div className="space-y-1">
                      {teamMembers.map((member) => (
                        <div key={member.id} className="text-sm text-foreground">
                          {member.name}
                          {member.id === task.leadId && (
                            <span className="text-xs text-muted-foreground"> (Lead)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {currentUser?.id === project?.leadId && (
                    <button
                      onClick={() => {
                        const teamIds = [...(task?.teamUserIds || [])];
                        // Ensure current assignee is always in the team selection
                        if (task?.assigneeId && !teamIds.includes(task.assigneeId)) {
                          teamIds.push(task.assigneeId);
                        }
                        setSelectedTeamIds(teamIds);
                        setSelectedLeadId(task?.leadId?.toString() || "");
                        setShowManageTeam(true);
                      }}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Manage Team
                    </button>
                  )}
                </div>
              </div>
              {task?.teamApprovedAt && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Team Approved</span>
                  <p className="text-sm text-emerald-600 mt-1">{fmtDate(task.teamApprovedAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showManageTeam && (
        <Dlg title="Manage Task Team" onClose={() => setShowManageTeam(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Team Members (from project team)
              </span>
              {task?.assigneeId && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  The current assignee must remain in the team. You can reassign the task before changing the team if needed.
                </p>
              )}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {projectTeamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No project team members available. Add team members to the project first.
                  </p>
                ) : (
                  projectTeamMembers.map((user) => (
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
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Select Lead</label>
                <select
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  <option value="">Select lead</option>
                  {projectTeamMembers
                    .filter((u) => selectedTeamIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>
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
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
              <select
                value={subtaskForm.priority}
                onChange={(e) => setSubtaskForm({ ...subtaskForm, priority: e.target.value })}
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
                value={subtaskForm.dueDate}
                onChange={(e) => setSubtaskForm({ ...subtaskForm, dueDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Assignees (from task team)
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No task team members available. Add team members to the task first.
                  </p>
                ) : (
                  teamMembers.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={subtaskForm.assigneeIds.includes(user.id)}
                        onChange={() => toggleSubtaskAssignee(user.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={user.name} size="sm" />
                      <span className="text-sm text-foreground">{user.name}</span>
                    </label>
                  ))
                )}
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

      {showReassignSubtask && (
        <Dlg title="Reassign Subtask" onClose={() => setShowReassignSubtask(null)}>
          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Assignees (from task team)
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No task team members available. Add team members to the task first.
                  </p>
                ) : (
                  teamMembers.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={reassignUserIds.includes(user.id)}
                        onChange={() => toggleReassignUser(user.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={user.name} size="sm" />
                      <span className="text-sm text-foreground">{user.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowReassignSubtask(null)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => handleUpdateSubtaskAssignees(showReassignSubtask.id, reassignUserIds)}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              Reassign
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
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due Date</label>
                <input
                  type="datetime-local"
                  value={editTaskForm.dueDate}
                  onChange={(e) => setEditTaskForm({ ...editTaskForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                />
              </div>
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

      {showNewReport && (
        <Dlg title="New Report" onClose={() => setShowNewReport(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Content</label>
              <textarea
                value={reportContent}
                onChange={(e) => setReportContent(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[120px] resize-y"
                rows={5}
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowNewReport(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateReport}
              disabled={!reportContent.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Report
            </button>
          </div>
        </Dlg>
      )}

      {previewFile && (
  <div
    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
    onClick={() => setPreviewFile(null)}
  >
    <div
      className="bg-white rounded-xl w-full h-full max-w-5xl flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <p className="text-sm font-medium text-foreground truncate">{previewFile.filename}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadOriginal(previewFile)}
            className="px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
          >
            Download original
          </button>
          <button
            onClick={() => setPreviewFile(null)}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-auto">
        {previewFile.isImage ? (
          <img src={previewFile.url} alt={previewFile.filename} className="max-w-full max-h-full object-contain" />
        ) : (
          <iframe src={previewFile.url} title={previewFile.filename} className="w-full h-full" />
        )}
      </div>
    </div>
  </div>
)}
    </div>
  );
}
