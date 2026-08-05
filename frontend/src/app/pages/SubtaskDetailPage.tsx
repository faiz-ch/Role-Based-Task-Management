import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Plus, Image, FileText, X, Trash2, Paperclip, MessageCircle } from "lucide-react";
import { Subtask, UserType, Task, Project } from "../types";
import { getSubtask, updateSubtaskStatus } from "../api/subtasks";
import { getTask } from "../api/tasks";
import { getProject } from "../api/projects";
import { getUsers } from "../api/users";
import { getSubtaskReports, createSubtaskReport, Report } from "../api/reports";
import { getSubtaskComments, Comment } from "../api/comments";
import { uploadSubtaskAttachment, getSubtaskAttachments, getAttachmentDownloadUrl, fetchAttachmentBlobUrl, fetchAttachmentPreviewBlobUrl, deleteAttachment, Attachment } from "../api/attachments";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { PriBadge } from "../components/PriBadge";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";

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
  const [reports, setReports] = useState<Report[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: number; url: string; filename: string; isImage: boolean } | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showApproveComment, setShowApproveComment] = useState(true);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [rescheduleComment, setRescheduleComment] = useState("");

  const canManage = permissions.includes("project:manage") && (
    currentUser?.role?.allDepartments ||
    (project?.departmentIds && currentUser?.role?.departments?.some(d => project.departmentIds.includes(d.id)))
  );

  function canManageSubtask(): boolean {
    if (!subtask || !task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId ||
      subtask.assigneeIds.includes(currentUser?.id || 0)
    );
  }

  function canApproveSubtask(): boolean {
    if (!subtask || !task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId
    );
  }

  function isSubtaskAssignee(): boolean {
    return subtask?.assigneeIds.includes(currentUser?.id || 0) || false;
  }

  function isSubtaskCreator(): boolean {
    return currentUser?.id === subtask?.createdBy || false;
  }

  function canSubmitForReview(): boolean {
    return (
      isSubtaskAssignee() &&
      (subtask?.status === "To Do" || subtask?.status === "Reschedule") &&
      reports.length > 0 &&
      attachments.length > 0
    );
  }

  function getSubmitDisableReason(): string {
    if (!isSubtaskAssignee()) return "";
    if (subtask?.status !== "To Do" && subtask?.status !== "Reschedule") return "";
    if (reports.length === 0 && attachments.length === 0) {
      return "Cannot submit for review — both a report and an attachment are required before submitting.";
    }
    if (reports.length === 0) {
      return "Cannot submit for review — a report is required before submitting.";
    }
    if (attachments.length === 0) {
      return "Cannot submit for review — an attachment is required before submitting.";
    }
    return "";
  }

  async function handleSubmitForReview() {
    if (!subtask) return;
    try {
      setError(null);
      const updated = await updateSubtaskStatus(subtask.id, "Review");
      setSubtask(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to submit for review");
    }
  }

  async function handleApprove() {
    if (!subtask) return;
    if (!approveComment.trim()) {
      setError("A comment is required when approving a subtask.");
      return;
    }
    try {
      setError(null);
      const updated = await updateSubtaskStatus(subtask.id, "Done", approveComment.trim());
      setSubtask(updated);
      setApproveComment("");
    } catch (err: any) {
      setError(err?.message || "Failed to approve subtask");
    }
  }

  async function handleReschedule() {
    if (!subtask) return;
    if (!rescheduleComment.trim()) {
      setError("A comment is required when rescheduling a subtask.");
      return;
    }
    try {
      setError(null);
      const isoDate = rescheduleDate ? new Date(rescheduleDate).toISOString() : undefined;
      const updated = await updateSubtaskStatus(subtask.id, "Reschedule", rescheduleComment.trim(), isoDate);
      setSubtask(updated);
      setShowReschedule(false);
      setRescheduleDate("");
      setRescheduleComment("");
    } catch (err: any) {
      setError(err?.message || "Failed to reschedule subtask");
    }
  }

  async function handleCreateReport() {
    if (!subtask || !reportContent.trim()) return;
    try {
      setError(null);
      const newReport = await createSubtaskReport(subtask.id, { content: reportContent.trim() });
      setReports([newReport, ...reports]);
      setReportContent("");
      setShowNewReport(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create report");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !subtaskId) return;

    try {
      setUploading(true);
      setError(null);
      const uploaded = await uploadSubtaskAttachment(Number(subtaskId), file);
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      setError(err?.message || "Failed to upload file");
    } finally {
      setUploading(false);
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

  async function handlePreview(attachment: Attachment) {
    try {
      setError(null);
      const isImage = attachment.contentType.startsWith("image/");
      if (isImage) {
        const url = await fetchAttachmentBlobUrl(attachment.id);
        setPreviewFile({ id: attachment.id, url, filename: attachment.filename, isImage: true });
      } else {
        const url = await fetchAttachmentPreviewBlobUrl(attachment.id);
        setPreviewFile({ id: attachment.id, url, filename: attachment.filename, isImage: false });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load preview");
    }
  }

  function handleDownloadOriginal(file: { id: number; filename: string }) {
    const url = getAttachmentDownloadUrl(file.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

            // Load reports
            try {
              const reportsData = await getSubtaskReports(subtaskResult.value.id);
              setReports(reportsData);
            } catch (err) {
              console.error("Failed to load reports:", err);
            }

            // Load comments
            try {
              const commentsData = await getSubtaskComments(subtaskResult.value.id);
              setComments(commentsData);
            } catch (err) {
              console.error("Failed to load comments:", err);
            }

            // Load attachments
            try {
              const attachmentsData = await getSubtaskAttachments(subtaskResult.value.id);
              setAttachments(attachmentsData);
            } catch (err) {
              console.error("Failed to load attachments:", err);
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">{subtask.title}</h1>
                <StatusBadge status={subtask.status} />
                <PriBadge priority={subtask.priority} />
              </div>
              {isSubtaskAssignee() && (subtask.status === "To Do" || subtask.status === "Reschedule") ? (
                canSubmitForReview() ? (
                  <button
                    onClick={handleSubmitForReview}
                    className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                  >
                    Submit for review
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-4 py-2 bg-gray-300 text-gray-500 text-sm font-semibold rounded-lg cursor-not-allowed"
                    title={getSubmitDisableReason()}
                  >
                    Submit for review
                  </button>
                )
              ) : null}
            </div>
            {/* Approve/Reschedule actions */}
            {canApproveSubtask() && subtask.status === "Review" && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowApproveComment(true);
                      setShowReschedule(false);
                    }}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setShowReschedule(!showReschedule);
                      setShowApproveComment(false);
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Reschedule
                  </button>
                </div>
                {showApproveComment && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Comment (required for approval)
                    </label>
                    <textarea
                      value={approveComment}
                      onChange={(e) => setApproveComment(e.target.value)}
                      placeholder="Add a comment explaining your approval decision..."
                      className="w-full p-2 border border-border rounded-lg text-sm resize-none"
                      rows={2}
                    />
                    <button
                      onClick={handleApprove}
                      disabled={!approveComment.trim()}
                      className="mt-2 w-full px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirm approval
                    </button>
                  </div>
                )}
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
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-3 block">
                      Comment (required for reschedule)
                    </label>
                    <textarea
                      value={rescheduleComment}
                      onChange={(e) => setRescheduleComment(e.target.value)}
                      placeholder="Add a comment explaining why you're rescheduling..."
                      className="w-full p-2 border border-border rounded-lg text-sm resize-none"
                      rows={2}
                    />
                    <button
                      onClick={handleReschedule}
                      disabled={!rescheduleComment.trim()}
                      className="mt-2 w-full px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirm reschedule
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {subtask.description ? (
            <div className="bg-white rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Description</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{subtask.description}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <FileText size={12} />
              <span>No description</span>
            </div>
          )}

          {/* Attachments and Reports side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Reports */}
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Reports</h2>
                </div>
                {isSubtaskAssignee() && (
                  <button
                    onClick={() => setShowNewReport(true)}
                    className="flex items-center gap-1.5 px-2 py-1 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                  >
                    <Plus size={10} />
                  </button>
                )}
              </div>
              {reports.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No reports yet
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => {
                    const author = users.find((u) => u.id === report.createdBy);
                    return (
                      <div key={report.id} className="border-b border-border pb-2:last:pb-0 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {author && <Av name={author.name} size="sm" />}
                            <span className="text-xs font-medium text-foreground">{author?.name || "Unknown"}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{fmtDate(report.createdAt)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">{report.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Attachments */}
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Paperclip size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
                </div>
                {(isSubtaskAssignee() || canManageSubtask()) && (
                  <label className="flex items-center gap-1.5 px-2 py-1 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer">
                    <Plus size={10} />
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>
              {attachments.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No attachments yet
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {attachment.contentType.startsWith("image/") ? (
                          <Image size={14} className="text-muted-foreground flex-shrink-0" />
                        ) : (
                          <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="text-xs text-foreground truncate">{attachment.filename}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePreview(attachment)}
                          className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
                          title="Preview"
                        >
                          <Image size={12} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDownloadOriginal({ id: attachment.id, filename: attachment.filename })}
                          className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
                          title="Download"
                        >
                          <FileText size={12} className="text-muted-foreground" />
                        </button>
                        {attachment.uploadedBy === currentUser?.id && (
                          <button
                            onClick={() => handleDeleteAttachment(attachment.id)}
                            className="p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={12} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comments */}
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Comments</h2>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">From approve/reschedule decisions</p>
            {comments.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">
                No comments yet
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => {
                  const author = users.find((u) => u.id === comment.authorId);
                  return (
                    <div key={comment.id} className="border-b border-border pb-2:last:pb-0 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {author && <Av name={author.name} size="sm" />}
                          <span className="text-xs font-medium text-foreground">{author?.name || "Unknown"}</span>
                          {comment.action === "approved" && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded">Approved</span>
                          )}
                          {comment.action === "rescheduled" && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">Rescheduled</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{fmtDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 space-y-4">
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Details</h2>
            <div className="space-y-3">
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
                <iframe src={previewFile.url} className="w-full h-full" title={previewFile.filename} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
