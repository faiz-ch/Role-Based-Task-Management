import { apiFetch } from "./client";
import { Role, PermDef, Category } from "../types";

function mapCategory(c: any): Category {
  return {
    id: c.id,
    name: c.name,
    permissions: Array.isArray(c.permissions) ? c.permissions.map((p: any) => p.name) : [],
    departmentIds: Array.isArray(c.departments) ? c.departments.map((d: any) => d.id) : [],
    assignableCategoryIds: Array.isArray(c.assignable_category_ids) ? c.assignable_category_ids : [],
  };
}

function mapRole(r: any): Role {
  return {
    id: r.id,
    name: r.name,
    category: r.category ? mapCategory(r.category) : null,
  };
}

export async function getRoles(): Promise<Role[]> {
  const data = await apiFetch("/roles");
  return Array.isArray(data) ? data.map(mapRole) : [];
}

export async function createRole(name: string, categoryId: number | null): Promise<Role> {
  const body: any = { name };
  if (categoryId !== null) body.category_id = categoryId;
  
  const data = await apiFetch("/roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapRole(data);
}

export async function setRoleCategory(roleId: number, categoryId: number | null): Promise<Role> {
  const data = await apiFetch(`/roles/${roleId}/category`, {
    method: "PATCH",
    body: JSON.stringify({ category_id: categoryId }),
  });
  return mapRole(data);
}

export async function getAllPermissions(): Promise<PermDef[]> {
  const data = await apiFetch("/roles/permissions/all");
  return Array.isArray(data) ? data : [];
}

export async function deleteRole(roleId: number): Promise<void> {
  await apiFetch(`/roles/${roleId}`, {
    method: "DELETE",
  });
}
