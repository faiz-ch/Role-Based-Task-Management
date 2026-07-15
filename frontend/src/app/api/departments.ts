import { apiFetch } from "./client";
import { Department } from "../types";

function mapDepartment(d: any): Department {
  return {
    id: d.id,
    name: d.name,
  };
}

export async function getDepartments(): Promise<Department[]> {
  const data = await apiFetch("/departments");
  return Array.isArray(data) ? data.map(mapDepartment) : [];
}

export async function createDepartment(name: string): Promise<Department> {
  const data = await apiFetch("/departments", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return mapDepartment(data);
}

export async function deleteDepartment(id: number): Promise<void> {
  await apiFetch(`/departments/${id}`, {
    method: "DELETE",
  });
}
