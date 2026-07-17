import { apiFetch } from "./client";
import { UserType, Role, Category } from "../types";

function mapCategory(c: any): Category {
  return {
    id: c.id,
    name: c.name,
    permissions: Array.isArray(c.permissions) ? c.permissions.map((p: any) => p.name) : [],
  };
}

function mapRole(r: any): Role {
  return {
    id: r.id,
    name: r.name,
    category: r.category ? mapCategory(r.category) : null,
    allDepartments: r.all_departments || false,
    departments: Array.isArray(r.departments) ? r.departments.map((d: any) => ({ id: d.id, name: d.name })) : [],
    assignableCategories: Array.isArray(r.assignable_categories) ? r.assignable_categories.map(mapCategory) : [],
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

export async function createUser(data: { name: string; email: string; password: string; role_id?: number; department_id?: number }): Promise<UserType> {
  const res = await apiFetch("/users", {
    method: "POST",
    body: JSON.stringify(data),
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