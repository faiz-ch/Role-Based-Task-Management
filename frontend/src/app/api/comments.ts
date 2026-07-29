import { apiFetch } from "./client";

export interface Comment {
  id: number;
  authorId: number;
  content: string;
  createdAt: string;
}

export interface CommentCreate {
  content: string;
}

function mapComment(data: any): Comment {
  return {
    id: data.id,
    authorId: data.author_id,
    content: data.content,
    createdAt: data.created_at,
  };
}

// Task comments
export async function getTaskComments(taskId: number): Promise<Comment[]> {
  const data = await apiFetch(`/tasks/${taskId}/comments`);
  return data.map(mapComment);
}

export async function createTaskComment(taskId: number, payload: CommentCreate): Promise<Comment> {
  const data = await apiFetch(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapComment(data);
}

// Subtask comments
export async function getSubtaskComments(subtaskId: number): Promise<Comment[]> {
  const data = await apiFetch(`/subtasks/${subtaskId}/comments`);
  return data.map(mapComment);
}

export async function createSubtaskComment(subtaskId: number, payload: CommentCreate): Promise<Comment> {
  const data = await apiFetch(`/subtasks/${subtaskId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapComment(data);
}
