import { apiFetch } from "./client";

export interface DashboardSummary {
  user_type: "employee" | "manager";
  scope?: "global" | "department";
  tasks: {
    by_status: Record<string, number>;
    total: number;
  };
  subtasks: {
    by_status: Record<string, number>;
    total: number;
  };
  projects?: {
    by_status: Record<string, number>;
    total: number;
  };
  upcoming_due: Array<{
    type: "task" | "subtask";
    id: number;
    title: string;
    due_date: string;
    status: string;
    project_id?: number;
    project_name?: string;
    task_id?: number;
    task_title?: string;
  }>;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch("/dashboard/summary");
}
