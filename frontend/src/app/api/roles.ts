import { apiFetch } from "./client";
import { Role, PermDef, Category } from "../types";

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
    notifyOnAssign: r.notify_on_assign || false,
    notifyOnReview: r.notify_on_review || false,
    notifyOnReschedule: r.notify_on_reschedule || false,
    notifyOnDone: r.notify_on_done || false,
  };
}

export async function getRoles(): Promise<Role[]> {
  const data = await apiFetch("/roles");
  return Array.isArray(data) ? data.map(mapRole) : [];
}

export async function createRole(
  name: string,
  categoryId: number | null,
  allDepartments: boolean,
  departmentIds: number[],
  assignableCategoryIds: number[],
  notifyOnAssign: boolean,
  notifyOnReview: boolean,
  notifyOnReschedule: boolean,
  notifyOnDone: boolean
): Promise<Role> {
  const body: any = { name, all_departments: allDepartments, department_ids: departmentIds, assignable_category_ids: assignableCategoryIds, notify_on_assign: notifyOnAssign, notify_on_review: notifyOnReview, notify_on_reschedule: notifyOnReschedule, notify_on_done: notifyOnDone };
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

export async function setRoleDepartments(
  roleId: number,
  allDepartments: boolean,
  departmentIds: number[]
): Promise<Role> {
  const data = await apiFetch(`/roles/${roleId}/departments`, {
    method: "PATCH",
    body: JSON.stringify({ all_departments: allDepartments, department_ids: departmentIds }),
  });
  return mapRole(data);
}

export async function setRoleAssignableCategories(
  roleId: number,
  assignableCategoryIds: number[]
): Promise<Role> {
  const data = await apiFetch(`/roles/${roleId}/assignable-categories`, {
    method: "PATCH",
    body: JSON.stringify({ assignable_category_ids: assignableCategoryIds }),
  });
  return mapRole(data);
}

export async function setRoleNotifications(
  roleId: number,
  notifyOnAssign: boolean,
  notifyOnReview: boolean,
  notifyOnReschedule: boolean,
  notifyOnDone: boolean
): Promise<Role> {
  const data = await apiFetch(`/roles/${roleId}/notifications`, {
    method: "PATCH",
    body: JSON.stringify({
      notify_on_assign: notifyOnAssign,
      notify_on_review: notifyOnReview,
      notify_on_reschedule: notifyOnReschedule,
      notify_on_done: notifyOnDone,
    }),
  });
  return mapRole(data);
}

export async function deleteRole(roleId: number): Promise<void> {
  await apiFetch(`/roles/${roleId}`, {
    method: "DELETE",
  });
}
