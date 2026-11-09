import React from "react";
import { Link } from "react-router";
import { ProjectBudget, setTaskBudget } from "../../api/budget";
import { fmtPKR } from "../../api/approvals";
import { ApprovalCard, fmtWhen } from "../../components/ApprovalCard";
import { AllocationMeter, AmountEditor, BudgetFigure } from "../../components/BudgetParts";

/**
 * Budget tab (only once the Budget approval is Approved):
 * approved budget (+ approved increases), how much is given to tasks, what is left,
 * one row per task (the lead sets amounts), and the Budget increase request.
 */
export function BudgetTab({ budget }: { budget: ProjectBudget }) {
  const b = budget;
  const maxShare = Math.max(1, ...b.tasks.map((t) => t.amount));
  return (
    <div className="space-y-6" data-testid="budget-tab">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <BudgetFigure label="Approved budget" value={b.total} tone="gold" testId="budget-total"
          hint={b.increases.length ? `${fmtPKR(b.initial)} + ${b.increases.length} increase${b.increases.length === 1 ? "" : "s"}` : "As approved"} />
        <BudgetFigure label="Allocated to tasks" value={b.allocated} testId="budget-allocated" />
        <BudgetFigure label="Remaining to allocate" value={b.remaining} tone={b.remaining > 0 ? "green" : "ink"} testId="budget-remaining" />
        <div className="bg-white rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Allocation</p>
          <AllocationMeter given={b.allocated} total={b.total} />
        </div>
      </div>

      <section className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Budget by task</h2>
          {b.canAllocate && <span className="text-xs text-muted-foreground">Click the pencil to set a task's budget. 0 removes it.</span>}
        </div>
        {b.tasks.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No tasks yet. Add tasks to split the budget among them.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="budget-tasks">
              <thead><tr className="bg-muted/30 border-b border-border text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3">Task</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Budget</th>
                <th className="px-5 py-3 min-w-[180px]">Share of project</th><th className="px-5 py-3">Given to subtasks</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {b.tasks.map((t) => {
                  const share = b.total > 0 ? (t.amount / b.total) * 100 : 0;
                  return (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3"><Link to={`/tasks/${t.id}`} className="font-medium hover:text-blue-600 hover:underline">{t.title}</Link></td>
                      <td className="px-5 py-3 text-muted-foreground">{t.status}</td>
                      <td className="px-5 py-3">
                        <AmountEditor value={t.amount} label={t.title} max={t.amount + b.remaining}
                          onSave={b.canAllocate ? async (v) => { await setTaskBudget(t.id, v); } : undefined} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2" title={`${t.title}: ${fmtPKR(t.amount)} (${share.toFixed(1)}%)`}>
                          <div className="flex-1 h-2 rounded-full bg-[#F1ECE0] overflow-hidden">
                            <div className="h-full rounded-full bg-[#B08C2E]" style={{ width: `${(t.amount / maxShare) * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {t.subtaskCount === 0 ? "No subtasks" : `${fmtPKR(t.subtasksAllocated)} · ${t.subtaskCount} subtask${t.subtaskCount === 1 ? "" : "s"}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {b.increase && <ApprovalCard a={b.increase} />}
        <section className="bg-white rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Budget history</h2>
          <ul className="space-y-2 text-sm" data-testid="budget-history">
            <li className="flex justify-between gap-3"><span>Budget approved</span><span className="font-semibold">{fmtPKR(b.initial)}</span></li>
            {b.increases.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>Increase approved{e.by ? ` by ${e.by}` : ""} <span className="text-xs text-muted-foreground">· {fmtWhen(e.at)}</span>{e.comment && <span className="block text-xs text-muted-foreground">{e.comment}</span>}</span>
                <span className="font-semibold text-emerald-700">+ {fmtPKR(e.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 pt-2 border-t border-border"><span className="font-semibold">Total</span><span className="font-bold">{fmtPKR(b.total)}</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
