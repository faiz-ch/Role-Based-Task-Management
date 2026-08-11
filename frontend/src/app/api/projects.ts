import { apiFetch } from "./client";
import { Project, UserType, Milestone, Attachment } from "../types";

function mapUser(u: any): UserType {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.is_active,
    role: u.role ? {
      id: u.role.id,
      name: u.role.name,
      description: u.role.description || null,
      color: u.role.color || "blue",
      isActive: u.role.is_active ?? true,
      isSystem: u.role.is_system ?? false,
      createdBy: u.role.created_by || null,
      creator: u.role.creator ? { id: u.role.creator.id, name: u.role.creator.name } : null,
      createdAt: u.role.created_at || "",
      updatedAt: u.role.updated_at || "",
      permissions: Array.isArray(u.role.permissions) ? u.role.permissions.map((p: any) => p.name) : [],
      allDepartments: u.role.all_departments || false,
      departments: Array.isArray(u.role.departments) ? u.role.departments.map((d: any) => ({ id: d.id, name: d.name })) : [],
      assignableRoles: Array.isArray(u.role.assignable_roles) ? u.role.assignable_roles.map((ar: any) => ({ id: ar.id, name: ar.name })) : [],
      userCount: u.role.user_count || 0,
    } : null,
    department: u.department ? { id: u.department.id, name: u.department.name } : null,
  };
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapProject(p: any): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description || "",
    status: p.status,
    priority: p.priority,
    createdBy: p.created_by,
    leadId: p.lead_id,
    teamApprovedBy: p.team_approved_by,
    teamApprovedAt: p.team_approved_at,
    dueDate: p.due_date ? toDatetimeLocalValue(p.due_date) : "",
    createdAt: p.created_at ? p.created_at.slice(0, 10) : "",
    departmentIds: p.department_ids || [],
    teamUserIds: p.team_user_ids || [],
    startDate: p.start_date ? toDatetimeLocalValue(p.start_date) : null,
    color: p.color || null,
    completedAt: p.completed_at || null,
    closingNotes: p.closing_notes || null,
    reopenedReason: p.reopened_reason || null,
    reopenedBy: p.reopened_by || null,
    reopenedAt: p.reopened_at || null,
  };
}

export async function getProjects(): Promise<Project[]> {
  const data = await apiFetch("/projects");
  return Array.isArray(data) ? data.map(mapProject) : [];
}

export async function getProject(id: number): Promise<Project> {
  const res = await apiFetch(`/projects/${id}`);
  return mapProject(res);
}

export async function createProject(input: {
  name: string;
  description: string;
  priority: string;
  dueDate: string;
  departmentIds: number[];
  startDate?: string;
  color?: string;
  leadId?: number;
  teamUserIds?: number[];
}): Promise<Project> {
  const payload: any = {
    name: input.name,
    description: input.description || null,
    priority: input.priority,
    due_date: input.dueDate ? new Date(input.dueDate).toISOString() : null,
    department_ids: input.departmentIds,
  };
  if (input.startDate !== undefined) payload.start_date = input.startDate ? new Date(input.startDate).toISOString() : null;
  if (input.color !== undefined) payload.color = input.color;
  if (input.leadId !== undefined) payload.lead_id = input.leadId;
  if (input.teamUserIds !== undefined) payload.team_user_ids = input.teamUserIds;
  const data = await apiFetch("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapProject(data);
}

export async function updateProject(id: number, input: Partial<{
  name: string;
  description: string;
  priority: string;
  dueDate: string;
  departmentIds: number[];
}>): Promise<Project> {
  const payload: any = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate ? new Date(input.dueDate).toISOString() : null;
  if (input.departmentIds !== undefined) payload.department_ids = input.departmentIds;
  const data = await apiFetch(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapProject(data);
}

export async function deleteProject(id: number): Promise<void> {
  await apiFetch(`/projects/${id}`, {
    method: "DELETE",
  });
}

export async function updateProjectTeam(id: number, userIds: number[], leadId?: number): Promise<Project> {
  const payload: any = { user_ids: userIds };
  if (leadId !== undefined) {
    payload.lead_id = leadId;
  }
  const data = await apiFetch(`/projects/${id}/team`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return mapProject(data);
}

export async function getProjectCandidates(projectId: number): Promise<UserType[]> {
  const data = await apiFetch(`/projects/${projectId}/candidates`);
  return Array.isArray(data) ? data.map(mapUser) : [];
}

export async function sendProjectForApproval(projectId: number): Promise<Project> {
  const data = await apiFetch(`/projects/${projectId}/complete`, {
    method: "PATCH",
  });
  return mapProject(data);
}

export async function approveProject(projectId: number): Promise<Project> {
  const data = await apiFetch(`/projects/${projectId}/approve`, {
    method: "PATCH",
  });
  return mapProject(data);
}

export async function rejectProject(projectId: number, reason: string): Promise<Project> {
  const data = await apiFetch(`/projects/${projectId}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
  return mapProject(data);
}

export async function closeProject(projectId: number, closingNotes?: string): Promise<Project> {
  const payload: any = {};
  if (closingNotes !== undefined) payload.closing_notes = closingNotes;
  const data = await apiFetch(`/projects/${projectId}/close`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapProject(data);
}

export async function reopenProject(projectId: number, reason: string): Promise<Project> {
  const data = await apiFetch(`/projects/${projectId}/reopen`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
  return mapProject(data);
}

function mapMilestone(m: any): Milestone {
  return {
    id: m.id,
    projectId: m.project_id,
    title: m.title,
    description: m.description || null,
    dueDate: m.due_date ? toDatetimeLocalValue(m.due_date) : null,
    status: m.status,
    createdBy: m.created_by,
    createdAt: m.created_at,
  };
}

export async function getProjectMilestones(projectId: number): Promise<Milestone[]> {
  const data = await apiFetch(`/milestones/projects/${projectId}/milestones`);
  return Array.isArray(data) ? data.map(mapMilestone) : [];
}

export async function createMilestone(projectId: number, input: {
  title: string;
  description?: string;
  dueDate?: string;
  status?: string;
}): Promise<Milestone> {
  const payload: any = {
    title: input.title,
    description: input.description || null,
    due_date: input.dueDate ? new Date(input.dueDate).toISOString() : null,
    status: input.status || "Planned",
  };
  const data = await apiFetch(`/milestones/projects/${projectId}/milestones`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapMilestone(data);
}

export async function updateMilestone(milestoneId: number, input: Partial<{
  title: string;
  description: string;
  dueDate: string;
  status: string;
}>): Promise<Milestone> {
  const payload: any = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate ? new Date(input.dueDate).toISOString() : null;
  if (input.status !== undefined) payload.status = input.status;
  const data = await apiFetch(`/milestones/milestones/${milestoneId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapMilestone(data);
}

export async function deleteMilestone(milestoneId: number): Promise<void> {
  await apiFetch(`/milestones/milestones/${milestoneId}`, {
    method: "DELETE",
  });
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

export async function getProjectAttachments(projectId: number): Promise<Attachment[]> {
  const data = await apiFetch(`/attachments/projects/${projectId}/attachments`);
  return Array.isArray(data) ? data.map(mapAttachment) : [];
}

export async function uploadProjectAttachment(projectId: number, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await apiFetch(`/attachments/projects/${projectId}/attachments`, {
    method: "POST",
    body: formData,
  });
  return mapAttachment(data);
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await apiFetch(`/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

export async function getAttachmentDownloadUrl(attachmentId: number): string {
  return `/api/attachments/${attachmentId}/download`;
}

export async function getProjectActivity(projectId: number): Promise<any[]> {
  const data = await apiFetch(`/projects/${projectId}/activity`);
  return Array.isArray(data) ? data : [];
}
