import { apiFetch } from "./client";

export interface Report {
  id: number;
  projectId: number | null;
  taskId: number | null;
  subtaskId: number | null;
  content: string;
  createdBy: number;
  createdAt: string;
}

export interface ReportCreate {
  content: string;
}

function mapReport(data: any): Report {
  return {
    id: data.id,
    projectId: data.project_id,
    taskId: data.task_id,
    subtaskId: data.subtask_id,
    content: data.content,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

// Project reports
export async function getProjectReports(projectId: number): Promise<Report[]> {
  const data = await apiFetch(`/projects/${projectId}/reports`);
  return data.map(mapReport);
}

export async function createProjectReport(projectId: number, payload: ReportCreate): Promise<Report> {
  const data = await apiFetch(`/projects/${projectId}/reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapReport(data);
}

// Task reports
export async function getTaskReports(taskId: number): Promise<Report[]> {
  const data = await apiFetch(`/tasks/${taskId}/reports`);
  return data.map(mapReport);
}

export async function createTaskReport(taskId: number, payload: ReportCreate): Promise<Report> {
  const data = await apiFetch(`/tasks/${taskId}/reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapReport(data);
}

// Subtask reports
export async function getSubtaskReports(subtaskId: number): Promise<Report[]> {
  const data = await apiFetch(`/subtasks/${subtaskId}/reports`);
  return data.map(mapReport);
}

export async function createSubtaskReport(subtaskId: number, payload: ReportCreate): Promise<Report> {
  const data = await apiFetch(`/subtasks/${subtaskId}/reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapReport(data);
}
