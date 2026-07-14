import { apiFetch } from "./client";
import { Role, PermDef } from "../types";

function mapRole(r: any): Role {
  return {
    id: r.id,
    name: r.name,
    permissionIds: Array.isArray(r.permissions) ? r.permissions.map((p: any) => p.id) : [],
  };
}

export async function getRoles(): Promise<Role[]> {
  const data = await apiFetch("/roles");
  return Array.isArray(data) ? data.map(mapRole) : [];
}

export async function createRole(name: string): Promise<Role> {
  const data = await apiFetch("/roles", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return mapRole(data);
}

export async function setRolePermissions(roleId: number, permissionIds: number[]): Promise<Role> {
  const data = await apiFetch(`/roles/${roleId}/permissions`, {
    method: "PATCH",
    body: JSON.stringify({ permission_ids: permissionIds }),
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
