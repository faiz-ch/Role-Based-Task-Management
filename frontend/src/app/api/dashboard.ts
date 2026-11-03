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

/** Filters sent to every dashboard address (see backend/app/routers/dashboard.py). */
export interface DashboardParams {
  department_id?: number;
  project_id?: number;
  due_from?: string; // ISO date-time
  due_to?: string;   // ISO date-time
  overdue?: boolean;
}

export interface DashboardFilterOptions {
  user_type: "employee" | "manager";
  departments: { id: number; name: string }[];
  projects: { id: number; name: string; department_ids: number[] }[];
}

function toQuery(params: DashboardParams = {}): string {
  const q = new URLSearchParams();
  if (params.department_id != null) q.set("department_id", String(params.department_id));
  if (params.project_id != null) q.set("project_id", String(params.project_id));
  if (params.due_from) q.set("due_from", params.due_from);
  if (params.due_to) q.set("due_to", params.due_to);
  if (params.overdue) q.set("overdue", "true");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getDashboardSummary(params: DashboardParams = {}): Promise<DashboardSummary> {
  return apiFetch(`/dashboard/summary${toQuery(params)}`);
}

export async function getDashboardFilterOptions(): Promise<DashboardFilterOptions> {
  return apiFetch("/dashboard/filter-options");
}

export async function getOverdueTasks(params: DashboardParams = {}): Promise<OverdueItem[]> {
  return apiFetch(`/dashboard/overdue/tasks${toQuery(params)}`);
}

export async function getOverdueSubtasks(params: DashboardParams = {}): Promise<OverdueItem[]> {
  return apiFetch(`/dashboard/overdue/subtasks${toQuery(params)}`);
}

export async function getOverdueProjects(params: DashboardParams = {}): Promise<OverdueItem[]> {
  return apiFetch(`/dashboard/overdue/projects${toQuery(params)}`);
}
