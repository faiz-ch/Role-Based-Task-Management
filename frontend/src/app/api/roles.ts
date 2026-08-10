import { apiFetch } from "./client";
import { Role, PermDef } from "../types";

function mapRole(r: any): Role {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    isActive: r.is_active,
    isSystem: r.is_system,
    createdBy: r.created_by,
    creator: r.creator ? { id: r.creator.id, name: r.creator.name } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    permissions: Array.isArray(r.permissions) ? r.permissions.map((p: any) => p.name) : [],
    allDepartments: r.all_departments || false,
    departments: Array.isArray(r.departments) ? r.departments.map((d: any) => ({ id: d.id, name: d.name })) : [],
    assignableRoles: Array.isArray(r.assignable_roles) ? r.assignable_roles.map((ar: any) => ({ id: ar.id, name: ar.name })) : [],
    userCount: r.user_count,
  };
}

export async function getRoles(): Promise<Role[]> {
  const data = await apiFetch("/roles");
  return Array.isArray(data) ? data.map(mapRole) : [];
}

export async function getRole(id: number): Promise<Role> {
  const data = await apiFetch(`/roles/${id}`);
  return mapRole(data);
}

export async function createRole(input: {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  isSystem?: boolean;
  categoryId?: number | null;
  permissionIds?: number[];
  allDepartments?: boolean;
  departmentIds?: number[];
  assignableRoleIds?: number[];
}): Promise<Role> {
  const payload: any = { name: input.name };
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.color !== undefined) payload.color = input.color;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.isSystem !== undefined) payload.is_system = input.isSystem;
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.permissionIds !== undefined) payload.permission_ids = input.permissionIds;
  if (input.allDepartments !== undefined) payload.all_departments = input.allDepartments;
  if (input.departmentIds !== undefined) payload.department_ids = input.departmentIds;
  if (input.assignableRoleIds !== undefined) payload.assignable_role_ids = input.assignableRoleIds;
  const data = await apiFetch("/roles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapRole(data);
}

export async function updateRole(id: number, input: Partial<{
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  isSystem: boolean;
  permissionIds: number[];
  allDepartments: boolean;
  departmentIds: number[];
  assignableRoleIds: number[];
}>): Promise<Role> {
  const payload: any = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.color !== undefined) payload.color = input.color;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.isSystem !== undefined) payload.is_system = input.isSystem;
  if (input.permissionIds !== undefined) payload.permission_ids = input.permissionIds;
  if (input.allDepartments !== undefined) payload.all_departments = input.allDepartments;
  if (input.departmentIds !== undefined) payload.department_ids = input.departmentIds;
  if (input.assignableRoleIds !== undefined) payload.assignable_role_ids = input.assignableRoleIds;
  const data = await apiFetch(`/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapRole(data);
}

export async function deleteRole(roleId: number): Promise<void> {
  await apiFetch(`/roles/${roleId}`, { method: "DELETE" });
}

export async function getRoleActivity(id: number): Promise<{
  actorId: number;
  action: string;
  detail: string | null;
  createdAt: string;
}[]> {
  const data = await apiFetch(`/roles/${id}/activity`);
  return Array.isArray(data) ? data.map((a: any) => ({
    actorId: a.actor_id,
    action: a.action,
    detail: a.detail,
    createdAt: a.created_at,
  })) : [];
}

export async function getAllPermissions(): Promise<PermDef[]> {
  const data = await apiFetch("/roles/permissions/all");
  return Array.isArray(data) ? data : [];
}
