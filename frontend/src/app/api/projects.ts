import { apiFetch } from "./client";
import { Project, UserType } from "../types";

function mapUser(u: any): UserType {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.is_active,
    role: u.role ? {
      id: u.role.id,
      name: u.role.name,
      category: u.role.category ? { id: u.role.category.id, name: u.role.category.name, permissions: Array.isArray(u.role.category.permissions) ? u.role.category.permissions.map((p: any) => p.name) : [] } : null,
      allDepartments: u.role.all_departments || false,
      departments: Array.isArray(u.role.departments) ? u.role.departments.map((d: any) => ({ id: d.id, name: d.name })) : [],
      assignableCategories: Array.isArray(u.role.assignable_categories) ? u.role.assignable_categories.map((c: any) => ({ id: c.id, name: c.name, permissions: Array.isArray(c.permissions) ? c.permissions.map((p: any) => p.name) : [] })) : [],
      notifyOnAssign: u.role.notify_on_assign || false,
      notifyOnReview: u.role.notify_on_review || false,
      notifyOnReschedule: u.role.notify_on_reschedule || false,
      notifyOnDone: u.role.notify_on_done || false,
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
}): Promise<Project> {
  const payload = {
    name: input.name,
    description: input.description || null,
    priority: input.priority,
    due_date: input.dueDate ? new Date(input.dueDate).toISOString() : null,
    department_ids: input.departmentIds,
  };
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
