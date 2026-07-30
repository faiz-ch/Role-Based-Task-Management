import { apiFetch } from "./client";
import { Subtask } from "../types";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapSubtask(s: any): Subtask {
  return {
    id: s.id,
    taskId: s.task_id,
    title: s.title,
    description: s.description || "",
    status: s.status,
    priority: s.priority,
    dueDate: s.due_date ? toDatetimeLocalValue(s.due_date) : "",
    createdBy: s.created_by,
    createdAt: s.created_at ? s.created_at.slice(0, 10) : "",
    assigneeIds: s.assignee_ids || [],
  };
}

export async function getSubtask(id: number): Promise<Subtask> {
  const data = await apiFetch(`/subtasks/${id}`);
  return mapSubtask(data);
}

export async function getSubtasks(taskId: number): Promise<Subtask[]> {
  const data = await apiFetch(`/subtasks/tasks/${taskId}/subtasks`);
  return Array.isArray(data) ? data.map(mapSubtask) : [];
}

export async function createSubtask(taskId: number, input: {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  assigneeIds: number[];
}): Promise<Subtask> {
  const payload: any = {
    title: input.title,
    description: input.description || null,
    priority: input.priority,
    due_date: input.dueDate ? new Date(input.dueDate).toISOString() : null,
    assignee_ids: input.assigneeIds,
  };
  const data = await apiFetch(`/subtasks/tasks/${taskId}/subtasks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapSubtask(data);
}

export async function updateSubtask(id: number, input: {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
}): Promise<Subtask> {
  const payload: any = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description || null;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate ? new Date(input.dueDate).toISOString() : null;
  
  const data = await apiFetch(`/subtasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapSubtask(data);
}

export async function updateSubtaskStatus(id: number, status: string, comment?: string, dueDate?: string): Promise<Subtask> {
  const payload: any = { status };
  if (comment !== undefined) {
    payload.comment = comment;
  }
  if (dueDate !== undefined) {
    payload.due_date = dueDate;
  }
  const data = await apiFetch(`/subtasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapSubtask(data);
}

export async function updateSubtaskAssignees(id: number, userIds: number[]): Promise<Subtask> {
  const data = await apiFetch(`/subtasks/${id}/assignees`, {
    method: "PUT",
    body: JSON.stringify({ user_ids: userIds }),
  });
  return mapSubtask(data);
}

export async function deleteSubtask(id: number): Promise<void> {
  await apiFetch(`/subtasks/${id}`, {
    method: "DELETE",
  });
}
