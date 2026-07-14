import { apiFetch } from "./client";

export interface DashboardSummary {
  total_tasks: number;
  by_status: Record<string, number>;
  overdue_count: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch("/dashboard/summary");
}
