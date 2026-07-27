import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertTriangle, Plus, Image, FileText, X, Trash2 } from "lucide-react";
import { Subtask, UserType, Task, Project } from "../types";
import { getSubtask } from "../api/subtasks";
import { getTask } from "../api/tasks";
import { getProject } from "../api/projects";
import { getUsers } from "../api/users";
import { getSubtaskReports, createSubtaskReport, Report } from "../api/reports";
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: number; url: string; filename: string; isImage: boolean } | null>(null);

  const canManage = permissions.includes("project:manage");

  function canManageSubtask(): boolean {
    if (!subtask || !task || !project) return false;
    return (
      canManage ||
      currentUser?.id === project.leadId ||
      currentUser?.id === task.leadId ||
      subtask.assigneeIds.includes(currentUser?.id || 0)
    );
  }

  function isSubtaskAssignee(): boolean {
    return subtask?.assigneeIds.includes(currentUser?.id || 0) || false;
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
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-foreground">{subtask.title}</h1>
              <StatusBadge status={subtask.status} />
              <PriBadge priority={subtask.priority} />
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Description</h2>
            {subtask.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{subtask.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description</p>
            )}
          </div>

          {/* Reports */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Reports</h2>
              {isSubtaskAssignee() && (
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

          {/* Attachments */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
              {(isSubtaskAssignee() || canManageSubtask()) && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer">
                  <Plus size={12} />
                  Upload
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
              <div className="text-sm text-muted-foreground text-center py-8">
                No attachments yet
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {attachment.contentType.startsWith("image/") ? (
                        <Image size={16} className="text-muted-foreground flex-shrink-0" />
                      ) : (
                        <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm text-foreground truncate">{attachment.filename}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePreview(attachment)}
                        className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                        title="Preview"
                      >
                        <Image size={14} className="text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDownloadOriginal({ id: attachment.id, filename: attachment.filename })}
                        className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                        title="Download"
                      >
                        <FileText size={14} className="text-muted-foreground" />
                      </button>
                      {(isSubtaskAssignee() || canManageSubtask()) && (
                        <button
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
