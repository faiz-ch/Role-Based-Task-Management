import { apiFetch, API_BASE_URL, getAccessToken } from "./client";

export interface PersonRef { id: number; name: string; email: string | null }

export interface ApprovalType {
  id: number;
  key: string | null;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  requiresAmount: boolean;
  requiresAttachment: boolean;
  mandatory: boolean;
  isActive: boolean;
  roles: { id: number; name: string }[];
  users: PersonRef[];
  inUse: number;
}

export type ApprovalStatus = "Not requested" | "Pending" | "Approved" | "Rejected" | "Sent back";

export interface ApprovalEvent {
  id: number;
  action: "requested" | "approved" | "rejected" | "sent_back";
  actor: PersonRef | null;
  amount: number | null;
  comment: string | null;
  attachmentName: string | null;
  createdAt: string;
}

export interface ProjectApproval {
  id: number;
  projectId: number;
  projectName: string | null;
  type: ApprovalType;
  status: ApprovalStatus;
  amount: number | null;
  approvedAmount: number | null;
  reason: string | null;
  attachmentName: string | null;
  requestedBy: PersonRef | null;
  requestedAt: string | null;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
  decisionComment: string | null;
  events: ApprovalEvent[];
  canRequest: boolean;
  canDecide: boolean;
  approvers: PersonRef[];
  approverIsAdminFallback: boolean;
  canOpenProject: boolean;
}

export interface ApproverOptions {
  roles: { id: number; name: string; members: PersonRef[] }[];
  users: (PersonRef & { role: string | null })[];
}

export interface ApprovalTypeInput {
  name: string;
  description: string;
  requiresAmount: boolean;
  requiresAttachment: boolean;
  mandatory: boolean;
  isActive: boolean;
  roleIds: number[];
  userIds: number[];
}

const mapType = (t: any): ApprovalType => ({
  id: t.id, key: t.key, name: t.name, description: t.description, isBuiltin: t.is_builtin,
  requiresAmount: t.requires_amount, requiresAttachment: t.requires_attachment, mandatory: t.mandatory,
  isActive: t.is_active, roles: t.roles || [], users: t.users || [], inUse: t.in_use ?? 0,
});

const mapEvent = (e: any): ApprovalEvent => ({
  id: e.id, action: e.action, actor: e.actor, amount: e.amount, comment: e.comment,
  attachmentName: e.attachment_name, createdAt: e.created_at,
});

const mapPA = (a: any): ProjectApproval => ({
  id: a.id, projectId: a.project_id, projectName: a.project_name, type: mapType(a.type), status: a.status,
  amount: a.amount, approvedAmount: a.approved_amount, reason: a.reason, attachmentName: a.attachment_name,
  requestedBy: a.requested_by, requestedAt: a.requested_at, decidedBy: a.decided_by, decidedAt: a.decided_at,
  decisionComment: a.decision_comment, events: (a.events || []).map(mapEvent),
  canRequest: a.can_request, canDecide: a.can_decide, approvers: a.approvers || [],
  approverIsAdminFallback: a.approver_is_admin_fallback, canOpenProject: a.can_open_project ?? true,
});

const typeBody = (v: Partial<ApprovalTypeInput>) => {
  const b: Record<string, unknown> = {};
  if (v.name !== undefined) b.name = v.name;
  if (v.description !== undefined) b.description = v.description;
  if (v.requiresAmount !== undefined) b.requires_amount = v.requiresAmount;
  if (v.requiresAttachment !== undefined) b.requires_attachment = v.requiresAttachment;
  if (v.mandatory !== undefined) b.mandatory = v.mandatory;
  if (v.isActive !== undefined) b.is_active = v.isActive;
  if (v.roleIds !== undefined) b.role_ids = v.roleIds;
  if (v.userIds !== undefined) b.user_ids = v.userIds;
  return JSON.stringify(b);
};

// ---- approval types
export async function getApprovalTypes(): Promise<ApprovalType[]> {
  const d = await apiFetch("/approval-types");
  return Array.isArray(d) ? d.map(mapType) : [];
}
export async function getApproverOptions(): Promise<ApproverOptions> {
  return apiFetch("/approval-types/approver-options");
}
export async function createApprovalType(v: ApprovalTypeInput): Promise<ApprovalType> {
  return mapType(await apiFetch("/approval-types", { method: "POST", body: typeBody(v) }));
}
export async function updateApprovalType(id: number, v: Partial<ApprovalTypeInput>): Promise<ApprovalType> {
  return mapType(await apiFetch(`/approval-types/${id}`, { method: "PATCH", body: typeBody(v) }));
}
export async function deleteApprovalType(id: number): Promise<void> {
  await apiFetch(`/approval-types/${id}`, { method: "DELETE" });
}

// ---- approvals on a project
export async function getProjectApprovals(projectId: number): Promise<ProjectApproval[]> {
  const d = await apiFetch(`/projects/${projectId}/approvals`);
  return Array.isArray(d) ? d.map(mapPA) : [];
}
export async function setProjectApprovals(projectId: number, typeIds: number[]): Promise<ProjectApproval[]> {
  const d = await apiFetch(`/projects/${projectId}/approvals`, { method: "PUT", body: JSON.stringify({ approval_type_ids: typeIds }) });
  return Array.isArray(d) ? d.map(mapPA) : [];
}
export async function requestApproval(id: number, v: { reason: string; amount?: string; file?: File | null }): Promise<ProjectApproval> {
  const fd = new FormData();
  fd.append("reason", v.reason);
  if (v.amount) fd.append("amount", v.amount);
  if (v.file) fd.append("file", v.file);
  return mapPA(await apiFetch(`/project-approvals/${id}/request`, { method: "POST", body: fd }));
}
export async function decideApproval(id: number, v: { action: "approve" | "reject" | "send_back"; comment?: string; approvedAmount?: number | null }): Promise<ProjectApproval> {
  return mapPA(await apiFetch(`/project-approvals/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({ action: v.action, comment: v.comment || null, approved_amount: v.approvedAmount ?? null }),
  }));
}
export async function fetchApprovalAttachmentUrl(id: number): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/project-approvals/${id}/attachment`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw new Error("Could not open the file.");
  return URL.createObjectURL(await res.blob());
}

// ---- inbox
export async function getApprovalsMe(): Promise<{ isApprover: boolean; pendingCount: number }> {
  const d = await apiFetch("/approvals/me");
  return { isApprover: !!d?.is_approver, pendingCount: d?.pending_count ?? 0 };
}
export async function getApprovalInbox(status: "pending" | "decided"): Promise<ProjectApproval[]> {
  const d = await apiFetch(`/approvals/inbox?status=${status}`);
  return Array.isArray(d) ? d.map(mapPA) : [];
}

/** PKR 1,250,000 */
export function fmtPKR(v: number | null | undefined): string {
  if (v == null) return "—";
  return "PKR " + v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
