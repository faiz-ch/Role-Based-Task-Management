import { apiFetch } from "./client";
import { Category, PermDef } from "../types";

function mapCategory(c: any): Category {
  return {
    id: c.id,
    name: c.name,
    permissions: Array.isArray(c.permissions) ? c.permissions.map((p: any) => p.name) : [],
  };
}

export async function getCategories(): Promise<Category[]> {
  const data = await apiFetch("/categories");
  return Array.isArray(data) ? data.map(mapCategory) : [];
}

export async function createCategory(
  name: string,
  permissionIds: number[]
): Promise<Category> {
  const data = await apiFetch("/categories", {
    method: "POST",
    body: JSON.stringify({
      name,
      permission_ids: permissionIds,
    }),
  });
  return mapCategory(data);
}

export async function updateCategory(
  categoryId: number,
  name: string | null,
  permissionIds: number[] | null
): Promise<Category> {
  const body: any = {};
  if (name !== null) body.name = name;
  if (permissionIds !== null) body.permission_ids = permissionIds;

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
