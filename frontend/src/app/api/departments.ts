import { apiFetch } from "./client";
import { Department } from "../types";

function mapDepartment(d: any): Department {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    headId: d.head_id,
    head: d.head ? { id: d.head.id, name: d.head.name, email: d.head.email } : null,
    color: d.color,
    isActive: d.is_active,
    memberCount: d.member_count,
    projectCount: d.project_count,
    createdAt: d.created_at,
  };
}

export async function getDepartments(): Promise<Department[]> {
  const data = await apiFetch("/departments");
  return Array.isArray(data) ? data.map(mapDepartment) : [];
}

export async function getDepartment(id: number): Promise<Department> {
  const data = await apiFetch(`/departments/${id}`);
  return mapDepartment(data);
}

export async function createDepartment(input: {
  name: string;
  description?: string;
  headId?: number | null;
  color?: string;
  isActive?: boolean;
}): Promise<Department> {
  const payload: any = { name: input.name };
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.headId !== undefined) payload.head_id = input.headId;
  if (input.color !== undefined) payload.color = input.color;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  const data = await apiFetch("/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapDepartment(data);
}

export async function updateDepartment(id: number, input: Partial<{
  name: string;
  description: string;
  headId: number | null;
  color: string;
  isActive: boolean;
}>): Promise<Department> {
  const payload: any = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.headId !== undefined) payload.head_id = input.headId;
  if (input.color !== undefined) payload.color = input.color;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  const data = await apiFetch(`/departments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapDepartment(data);
}

export async function deleteDepartment(id: number, moveUsersTo?: number, moveProjectsTo?: number): Promise<void> {
  const payload: any = {};
  if (moveUsersTo !== undefined) payload.move_users_to = moveUsersTo;
  if (moveProjectsTo !== undefined) payload.move_projects_to = moveProjectsTo;
  await apiFetch(`/departments/${id}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export async function getDepartmentActivity(id: number): Promise<{
  actorId: number;
  action: string;
  detail: string | null;
  createdAt: string;
}[]> {
  const data = await apiFetch(`/departments/${id}/activity`);
  return Array.isArray(data) ? data.map((a: any) => ({
    actorId: a.actor_id,
    action: a.action,
    detail: a.detail,
    createdAt: a.created_at,
  })) : [];
}
