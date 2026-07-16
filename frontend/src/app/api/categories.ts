import { apiFetch } from "./client";
import { Category, PermDef } from "../types";

function mapCategory(c: any): Category {
  return {
    id: c.id,
    name: c.name,
    permissions: Array.isArray(c.permissions) ? c.permissions.map((p: any) => p.name) : [],
    departmentIds: Array.isArray(c.departments) ? c.departments.map((d: any) => d.id) : [],
    assignableCategoryIds: Array.isArray(c.assignable_category_ids) ? c.assignable_category_ids : [],
  };
}

export async function getCategories(): Promise<Category[]> {
  const data = await apiFetch("/categories");
  return Array.isArray(data) ? data.map(mapCategory) : [];
}

export async function createCategory(
  name: string,
  permissionIds: number[],
  departmentIds: number[],
  assignableCategoryIds: number[]
): Promise<Category> {
  const data = await apiFetch("/categories", {
    method: "POST",
    body: JSON.stringify({
      name,
      permission_ids: permissionIds,
      department_ids: departmentIds,
      assignable_category_ids: assignableCategoryIds,
    }),
  });
  return mapCategory(data);
}

export async function updateCategory(
  categoryId: number,
  name: string | null,
  permissionIds: number[] | null,
  departmentIds: number[] | null,
  assignableCategoryIds: number[] | null
): Promise<Category> {
  const body: any = {};
  if (name !== null) body.name = name;
  if (permissionIds !== null) body.permission_ids = permissionIds;
  if (departmentIds !== null) body.department_ids = departmentIds;
  if (assignableCategoryIds !== null) body.assignable_category_ids = assignableCategoryIds;

  const data = await apiFetch(`/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return mapCategory(data);
}

export async function deleteCategory(categoryId: number): Promise<void> {
  await apiFetch(`/categories/${categoryId}`, {
    method: "DELETE",
  });
}
