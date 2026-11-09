import { apiFetch } from "./client";
import { ProjectApproval } from "./approvals";

export interface ProjectBudget {
  enabled: boolean;
  budgetStatus: string | null;
  initial: number;
  total: number;
  allocated: number;
  remaining: number;
  increases: { amount: number; at: string; by: string | null; comment: string | null }[];
  canAllocate: boolean;
  increase: ProjectApproval | null;
  tasks: { id: number; title: string; status: string; amount: number; subtaskCount: number; subtasksAllocated: number }[];
}

export interface TaskBudget {
  enabled: boolean;
  amount: number;
  allocatedToSubtasks: number;
  remaining: number;
  subtasks: { id: number; title: string; status: string; amount: number }[];
  projectTotal: number;
  projectRemaining: number;
  canSetTask: boolean;
  canAllocateSubtasks: boolean;
}

export interface SubtaskBudget {
  enabled: boolean;
  amount: number;
  taskAmount: number;
  taskRemaining: number;
  canSet: boolean;
}

// The increase approval comes in the server's own (snake_case) shape; map it like the others.
function mapIncrease(a: any): ProjectApproval | null {
  if (!a) return null;
  const t = a.type;
  return {
    id: a.id, projectId: a.project_id, projectName: a.project_name,
    type: { id: t.id, key: t.key, name: t.name, description: t.description, isBuiltin: t.is_builtin, requiresAmount: t.requires_amount,
      requiresAttachment: t.requires_attachment, mandatory: t.mandatory, isActive: t.is_active, roles: t.roles || [], users: t.users || [], inUse: t.in_use ?? 0 },
    status: a.status, amount: a.amount, approvedAmount: a.approved_amount, reason: a.reason, attachmentName: a.attachment_name,
    requestedBy: a.requested_by, requestedAt: a.requested_at, decidedBy: a.decided_by, decidedAt: a.decided_at, decisionComment: a.decision_comment,
    events: (a.events || []).map((e: any) => ({ id: e.id, action: e.action, actor: e.actor, amount: e.amount, comment: e.comment, attachmentName: e.attachment_name, createdAt: e.created_at })),
    canRequest: a.can_request, canDecide: a.can_decide, approvers: a.approvers || [], approverIsAdminFallback: a.approver_is_admin_fallback,
    canOpenProject: a.can_open_project ?? true,
  };
}

export async function getProjectBudget(projectId: number): Promise<ProjectBudget> {
  const d = await apiFetch(`/projects/${projectId}/budget`);
  return {
    enabled: !!d.enabled, budgetStatus: d.budget_status ?? null, initial: d.initial ?? 0, total: d.total ?? 0,
    allocated: d.allocated ?? 0, remaining: d.remaining ?? 0, increases: d.increases || [], canAllocate: !!d.can_allocate,
    increase: mapIncrease(d.increase),
    tasks: (d.tasks || []).map((t: any) => ({ id: t.id, title: t.title, status: t.status, amount: t.amount, subtaskCount: t.subtask_count, subtasksAllocated: t.subtasks_allocated })),
  };
}

const mapTask = (d: any): TaskBudget => ({
  enabled: !!d.enabled, amount: d.amount ?? 0, allocatedToSubtasks: d.allocated_to_subtasks ?? 0, remaining: d.remaining ?? 0,
  subtasks: d.subtasks || [], projectTotal: d.project_total ?? 0, projectRemaining: d.project_remaining ?? 0,
  canSetTask: !!d.can_set_task, canAllocateSubtasks: !!d.can_allocate_subtasks,
});
export async function getTaskBudget(taskId: number): Promise<TaskBudget> {
  return mapTask(await apiFetch(`/tasks/${taskId}/budget`));
}
export async function setTaskBudget(taskId: number, amount: number): Promise<TaskBudget> {
  return mapTask(await apiFetch(`/tasks/${taskId}/budget`, { method: "PUT", body: JSON.stringify({ amount }) }));
}

const mapSub = (d: any): SubtaskBudget => ({
  enabled: !!d.enabled, amount: d.amount ?? 0, taskAmount: d.task_amount ?? 0, taskRemaining: d.task_remaining ?? 0, canSet: !!d.can_set,
});
export async function getSubtaskBudget(subtaskId: number): Promise<SubtaskBudget> {
  return mapSub(await apiFetch(`/subtasks/${subtaskId}/budget`));
}
export async function setSubtaskBudget(subtaskId: number, amount: number): Promise<SubtaskBudget> {
  return mapSub(await apiFetch(`/subtasks/${subtaskId}/budget`, { method: "PUT", body: JSON.stringify({ amount }) }));
}
