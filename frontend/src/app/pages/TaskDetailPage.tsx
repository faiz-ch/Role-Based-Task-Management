import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Plus, Image, FileText, X, Trash2 } from "lucide-react";
import { Task, UserType, Department } from "../types";
import { getTask, updateTaskStatus, rescheduleTask } from "../api/tasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { uploadAttachment, getAttachments, getAttachmentDownloadUrl, fetchAttachmentBlobUrl, deleteAttachment, Attachment } from "../api/attachments";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";

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
  const [users, setUsers] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
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

        if (taskResult.status === "rejected") {
          setError((taskResult.reason as any)?.message || "Failed to load task.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [taskId]);

  const assignee = users.find((u) => u.id === task?.assigneeId);
  const department = departments.find((d) => d.id === task?.departmentId);

  const canDeleteAttachments =
    currentUser?.id === task?.assigneeId &&
    (task?.status === "To Do" || task?.status === "Reschedule");

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
    const blobUrl = await fetchAttachmentBlobUrl(attachment.id);
    if (attachment.contentType.startsWith("image/")) {
      setLightboxImage(blobUrl);
    } else {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    }
  } catch (err: any) {
    setError(err?.message || "Failed to open attachment");
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
      const updated = await rescheduleTask(task.id, isoDate);
      setTask(updated);
      setShowReschedule(false);
      setRescheduleDate("");
    } catch (err: any) {
      setError(err?.message || "Failed to reschedule task");
    } finally {
      setRescheduleLoading(false);
    }
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
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-foreground">{task.title}</h1>
              <StatusBadge status={task.status} />
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

          {/* Action area */}
          <div className="bg-white rounded-xl border border-border p-6">
            {permissions.includes("task:review") && task.status === "Review" ? (
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
            ) : task.assigneeId === currentUser?.id && (task.status === "To Do" || task.status === "Reschedule") ? (
              <button
                onClick={handleSubmitForReview}
                className="w-full px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Submit for review
              </button>
            ) : (
              <div className="text-sm text-muted-foreground text-center">
                {task.status === "Review" && "Waiting for review."}
                {task.status === "Reschedule" && "Rescheduled — waiting for the assignee to resubmit."}
                {task.status === "Done" && "This task is complete."}
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
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Assignee</span>
                <p className="text-sm text-foreground mt-1">
                  {assignee ? assignee.name : "Unassigned"}
                </p>
              </div>
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
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Department</span>
                <p className="text-sm text-foreground mt-1">
                  {department ? department.name : "None"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxImage(null);
            }}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
          >
            <X size={24} className="text-white" />
          </button>
          <img
            src={lightboxImage}
            alt="Attachment preview"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
