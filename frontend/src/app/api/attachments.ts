import { apiFetch, API_BASE_URL, getAccessToken } from "./client";

export interface Attachment {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: number;
  uploadedAt: string;
}

function mapAttachment(a: any): Attachment {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.content_type,
    sizeBytes: a.size_bytes,
    uploadedBy: a.uploaded_by,
    uploadedAt: a.uploaded_at,
  };
}

export async function uploadAttachment(taskId: number, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload file");
  return mapAttachment(await res.json());
}

export async function getAttachments(taskId: number): Promise<Attachment[]> {
  const res = await apiFetch(`/tasks/${taskId}/attachments`);
  return res.map(mapAttachment);
}

export function getAttachmentDownloadUrl(attachmentId: number): string {
  return `${API_BASE_URL}/tasks/attachments/${attachmentId}/download`;
}

export async function fetchAttachmentBlobUrl(attachmentId: number): Promise<string> {
  const res = await fetch(getAttachmentDownloadUrl(attachmentId), {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch attachment");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}