import React, { useState } from "react";
import { Upload, Download, Trash2, File, FileText, Image, Archive } from "lucide-react";
import { Project, Attachment } from "../../types";
import { Dlg } from "../../components/Dlg";

interface FilesTabProps {
  project: Project;
  attachments: Attachment[];
  onUploadAttachment: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: number) => Promise<void>;
  getDownloadUrl: (attachmentId: number) => string;
}

function fmtFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  
  if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
    return <Image size={20} className="text-blue-500" />;
  }
  if (["pdf", "doc", "docx", "txt", "rtf"].includes(ext)) {
    return <FileText size={20} className="text-red-500" />;
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <Archive size={20} className="text-amber-500" />;
  }
  
  return <File size={20} className="text-gray-500" />;
}

export function FilesTab({ 
  project, 
  attachments, 
  onUploadAttachment, 
  onDeleteAttachment, 
  getDownloadUrl 
}: FilesTabProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await onUploadAttachment(file);
    } catch (err: any) {
      console.error("Failed to upload file:", err);
    } finally {
      setUploading(false);
      // Reset input
      event.target.value = "";
    }
  }

  async function handleDeleteAttachment() {
    if (!selectedAttachment) return;
    try {
      await onDeleteAttachment(selectedAttachment.id);
      setShowDeleteConfirm(false);
      setSelectedAttachment(null);
    } catch (err: any) {
      console.error("Failed to delete attachment:", err);
    }
  }

  function openDeleteConfirm(attachment: Attachment) {
    setSelectedAttachment(attachment);
    setShowDeleteConfirm(true);
  }

  function handleDownload(attachment: Attachment) {
    const url = getDownloadUrl(attachment.id);
    window.open(url, "_blank");
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer">
            <Upload size={12} />
            Upload File
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>

        {uploading && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">Uploading file...</p>
          </div>
        )}

        {attachments.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No attachments yet
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
              >
                <div className="flex-shrink-0">
                  {getFileIcon(attachment.filename)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {attachment.filename}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {fmtFileSize(attachment.sizeBytes)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(attachment.uploadedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(attachment)}
                    className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Download"
                  >
                    <Download size={14} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => openDeleteConfirm(attachment)}
                    className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDeleteConfirm && selectedAttachment && (
        <Dlg title="Delete attachment" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete "{selectedAttachment.filename}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAttachment}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </>
  );
}