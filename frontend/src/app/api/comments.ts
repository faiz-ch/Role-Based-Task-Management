import { apiFetch } from "./client";

export interface Comment {
  id: number;
  authorId: number;
  content: string;
  action: string | null;
  createdAt: string;
}

function mapComment(data: any): Comment {
  return {
    id: data.id,
    authorId: data.author_id,
    content: data.content,
    action: data.action || null,
    createdAt: data.created_at,
  };
}

// Task comments
export async function getTaskComments(taskId: number): Promise<Comment[]> {
  const data = await apiFetch(`/tasks/${taskId}/comments`);
  return data.map(mapComment);
}

// Subtask comments
export async function getSubtaskComments(subtaskId: number): Promise<Comment[]> {
  const data = await apiFetch(`/subtasks/${subtaskId}/comments`);
  return data.map(mapComment);
}
