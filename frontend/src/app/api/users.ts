import { apiFetch } from "./client";
import { UserType, Role } from "../types";

function mapRole(r: any): Role {
  return {
    id: r.id,
    name: r.name,
    description: r.description || null,
    color: r.color || "blue",
    isActive: r.is_active ?? true,
    isSystem: r.is_system ?? false,
    createdBy: r.created_by || null,
    creator: r.creator ? { id: r.creator.id, name: r.creator.name } : null,
    createdAt: r.created_at || "",
    updatedAt: r.updated_at || "",
    permissions: Array.isArray(r.permissions) ? r.permissions.map((p: any) => p.name) : [],
    allDepartments: r.all_departments || false,
    departments: Array.isArray(r.departments) ? r.departments.map((d: any) => ({ id: d.id, name: d.name })) : [],
    assignableRoles: Array.isArray(r.assignable_roles) ? r.assignable_roles.map((ar: any) => ({ id: ar.id, name: ar.name })) : [],
    userCount: r.user_count || 0,
  };
}

function mapUser(u: any): UserType {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.is_active,
    role: u.role ? mapRole(u.role) : null,
    department: u.department ? { id: u.department.id, name: u.department.name } : null,
    createdAt: u.created_at,
  };
}

export async function getUsers(): Promise<UserType[]> {
  const data = await apiFetch("/users");
  return Array.isArray(data) ? data.map(mapUser) : [];
}

export async function getMe(): Promise<UserType> {
  const data = await apiFetch("/users/me");
  return mapUser(data);
}

export async function getMePermissions(): Promise<string[]> {
  return apiFetch("/users/me/permissions");
}

export async function updateUser(id: number, data: { name?: string; email?: string; password?: string; active?: boolean; department_id?: number }): Promise<UserType> {
  const payload: any = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.email !== undefined) payload.email = data.email;
  if (data.password !== undefined) payload.password = data.password;
  if (data.active !== undefined) payload.is_active = data.active;
  if (data.department_id !== undefined) payload.department_id = data.department_id;

  const res = await apiFetch(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapUser(res);
}

export async function assignRole(userId: number, roleId: number | null): Promise<UserType> {
  const res = await apiFetch(`/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role_id: roleId }),
  });
  return mapUser(res);
}

export async function createUser(data: { 
  name: string; 
  email: string; 
  password: string; 
  role_id?: number; 
  department_id?: number;
  isActive?: boolean;
  sendWelcomeEmail?: boolean;
}): Promise<UserType> {
  const payload: any = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.email !== undefined) payload.email = data.email;
  if (data.password !== undefined) payload.password = data.password;
  if (data.role_id !== undefined) payload.role_id = data.role_id;
  if (data.department_id !== undefined) payload.department_id = data.department_id;
  if (data.isActive !== undefined) payload.is_active = data.isActive;
  if (data.sendWelcomeEmail !== undefined) payload.send_welcome_email = data.sendWelcomeEmail;

  const res = await apiFetch("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapUser(res);
}

export async function deleteUser(id: number): Promise<void> {
  await apiFetch(`/users/${id}`, {
    method: "DELETE",
  });
}

export async function assignDepartment(userId: number, departmentId: number | null): Promise<UserType> {
  const res = await apiFetch(`/users/${userId}/department`, {
    method: "PATCH",
    body: JSON.stringify({ department_id: departmentId }),
  });
  return mapUser(res);
}