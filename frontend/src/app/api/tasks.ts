import { apiFetch } from "./client";
import { Task } from "../types";

function mapTask(t: any): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    status: t.status,
    priority: t.priority,
    dueDate: t.due_date ? t.due_date.slice(0, 10) : "",
    createdAt: t.created_at ? t.created_at.slice(0, 10) : "",
    creatorId: t.created_by,
    assigneeId: t.assigned_to,
    departmentId: t.department_id,
  };
}

export async function getTasks(options?: { assignedTo?: number }): Promise<Task[]> {
  const params = new URLSearchParams();
  if (options?.assignedTo !== undefined) {
    params.append("assigned_to", options.assignedTo.toString());
  }
  const url = params.toString() ? `/tasks?${params.toString()}` : "/tasks";
  const data = await apiFetch(url);
  return Array.isArray(data) ? data.map(mapTask) : [];
}

export async function createTask(task: {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  assigneeId: number | null;
  departmentId: number | null;
}): Promise<Task> {
  const payload = {
    title: task.title,
    description: task.description || null,
    priority: task.priority,
    due_date: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    assigned_to: task.assigneeId || null,
    department_id: task.departmentId || null,
  };
  const data = await apiFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapTask(data);
}

export async function updateTask(
  id: number,
  task: {
    title: string;
    description: string;
    priority: string;
    dueDate: string;
  }
): Promise<Task> {
  const payload = {
    title: task.title,
    description: task.description || null,
    priority: task.priority,
    due_date: task.dueDate ? new Date(task.dueDate).toISOString() : null,
  };
  const data = await apiFetch(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapTask(data);
}

export async function updateTaskStatus(id: number, status: string): Promise<Task> {
  const data = await apiFetch(`/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return mapTask(data);
}

export async function assignTask(id: number, assigneeId: number | null): Promise<Task> {
  const data = await apiFetch(`/tasks/${id}/assign`, {
    method: "PATCH",
    body: JSON.stringify({ assigned_to: assigneeId }),
  });
  return mapTask(data);
}

export async function deleteTask(id: number): Promise<void> {
  await apiFetch(`/tasks/${id}`, {
    method: "DELETE",
  });
}
