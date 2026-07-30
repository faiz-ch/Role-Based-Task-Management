import { apiFetch } from "./client";
import { Task } from "../types";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapTask(t: any): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    status: t.status,
    priority: t.priority,
    dueDate: t.due_date ? toDatetimeLocalValue(t.due_date) : "",
    createdAt: t.created_at ? t.created_at.slice(0, 10) : "",
    creatorId: t.created_by,
    assigneeId: t.assigned_to,
    projectId: t.project_id,
    leadId: t.lead_id,
    teamApprovedBy: t.team_approved_by,
    teamApprovedAt: t.team_approved_at,
    teamUserIds: t.team_user_ids || [],
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

export async function getTask(id: number): Promise<Task> {
  const res = await apiFetch(`/tasks/${id}`);
  return mapTask(res);
}

export async function createTask(task: {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  projectId: number;
  assigneeId?: number;
}): Promise<Task> {
  const payload: any = {
    title: task.title,
    description: task.description || null,
    priority: task.priority,
    due_date: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    project_id: task.projectId,
  };
  // Only include assigned_to if provided (backend auto-assigns if omitted)
  if (task.assigneeId !== undefined) {
    payload.assigned_to = task.assigneeId;
  }
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

export async function updateTaskStatus(id: number, status: string, dueDate?: string, comment?: string): Promise<Task> {
  const payload: any = { status };
  if (dueDate !== undefined) {
    payload.due_date = new Date(dueDate).toISOString();
  }
  if (comment !== undefined) {
    payload.comment = comment;
  }
  const data = await apiFetch(`/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
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

export async function updateTaskTeam(id: number, userIds: number[], leadId?: number): Promise<Task> {
  const payload: any = { user_ids: userIds };
  if (leadId !== undefined) {
    payload.lead_id = leadId;
  }
  const data = await apiFetch(`/tasks/${id}/team`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return mapTask(data);
}
