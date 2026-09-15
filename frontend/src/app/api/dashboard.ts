import { apiFetch } from "./client";

export interface OverdueItem {
  id: number;
  title: string;
  days_overdue: number;
  due_date: string;
  status: string;
  project_id?: number;
  project_name?: string | null;
  task_id?: number;
  task_title?: string | null;
  department_name?: string | null;
  departments?: string[];
  lead_name?: string | null;
}

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
  overdue_tasks?: OverdueItem[];
  overdue_tasks_total?: number;
  overdue_subtasks?: OverdueItem[];
  overdue_subtasks_total?: number;
  overdue_projects?: OverdueItem[];
  overdue_projects_total?: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch("/dashboard/summary");
}

export async function getOverdueTasks(): Promise<OverdueItem[]> {
  return apiFetch("/dashboard/overdue/tasks");
}

export async function getOverdueSubtasks(): Promise<OverdueItem[]> {
  return apiFetch("/dashboard/overdue/subtasks");
}

export async function getOverdueProjects(): Promise<OverdueItem[]> {
  return apiFetch("/dashboard/overdue/projects");
}
