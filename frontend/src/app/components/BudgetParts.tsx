import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { Check, Pencil, X, Wallet } from "lucide-react";
import { useCachedQuery, FRESH } from "../api/queries";
import { fmtPKR } from "../api/approvals";
import {
  TaskBudget, SubtaskBudget, getTaskBudget, setTaskBudget, getSubtaskBudget, setSubtaskBudget,
} from "../api/budget";
import { notifyError, notifySuccess } from "../utils/notify";

/* Shared pieces for budget tracking: figures, the allocation meter and the inline amount editor. */

export function BudgetFigure({ label, value, tone = "ink", hint, testId }: { label: string; value: number; tone?: "ink" | "gold" | "green" | "red"; hint?: string; testId?: string }) {
  const color = { ink: "text-foreground", gold: "text-[#8A6A1F]", green: "text-emerald-700", red: "text-red-700" }[tone];
  return (
    <div className="bg-white rounded-xl border border-border p-4" data-testid={testId}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${color}`}>{fmtPKR(value)}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

/** One bar: how much of `total` has been given out. Single series, so no legend; the labels say it. */
export function AllocationMeter({ given, total, givenLabel = "Allocated", leftLabel = "Not yet allocated" }: { given: number; total: number; givenLabel?: string; leftLabel?: string }) {
  const pct = total > 0 ? Math.min(100, (given / total) * 100) : 0;
  return (
    <div>
      <div className="h-3 rounded-full bg-[#F1ECE0] overflow-hidden" role="img" aria-label={`${givenLabel} ${pct.toFixed(0)}%`}
        title={`${givenLabel}: ${fmtPKR(given)} of ${fmtPKR(total)}`}>
        <div className="h-full rounded-full bg-[#B08C2E]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#B08C2E] mr-1.5" />{givenLabel} {pct.toFixed(0)}%</span>
        <span>{leftLabel} {fmtPKR(Math.max(0, total - given))}</span>
      </div>
    </div>
  );
}

/** Shows an amount; with `onSave`, a pencil turns it into an input (0 removes it). */
export function AmountEditor({ value, onSave, label, max }: { value: number; onSave?: (v: number) => Promise<void>; label: string; max?: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value || ""));
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setText(String(value || "")); }, [value, editing]);

  async function save() {
    const v = Number(text.replace(/,/g, "") || 0);
    if (!(v >= 0) || !Number.isFinite(v)) return notifyError("Please enter an amount (0 or more).");
    if (Math.round(v * 100) / 100 !== v) return notifyError("Use at most 2 decimal places.");
    if (max != null && v > max) return notifyError(`At most ${fmtPKR(max)} is available here.`);
    setSaving(true);
    try { await onSave!(v); setEditing(false); notifySuccess("Budget saved"); }
    catch (e: any) { notifyError(e?.message || "Could not save the budget."); }
    finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={value ? "font-semibold" : "text-muted-foreground"}>{value ? fmtPKR(value) : "—"}</span>
        {onSave && (
          <button type="button" aria-label={`Set budget for ${label}`} onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
            <Pencil size={13} />
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">PKR</span>
      <input autoFocus inputMode="decimal" aria-label={`Budget for ${label}`} value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="w-32 px-2 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      <button type="button" aria-label="Save budget" disabled={saving} onClick={save} className="p-1 rounded bg-[#15171C] text-white hover:bg-[#2A2D35] cursor-pointer disabled:opacity-50"><Check size={13} /></button>
      <button type="button" aria-label="Cancel" onClick={() => setEditing(false)} className="p-1 rounded hover:bg-muted cursor-pointer"><X size={13} /></button>
    </span>
  );
}

// ---------------------------------------------------------------- task page panel
export function TaskBudgetPanel({ taskId }: { taskId: number }) {
  const q = useCachedQuery<TaskBudget | null>(["task", taskId, "budget"], () => getTaskBudget(taskId), null, { staleTime: FRESH.LIVE });
  const b = q.data;
  if (!b || !b.enabled) return null;
  const hasSubs = b.subtasks.length > 0;
  return (
    <section className="bg-white rounded-xl border border-border p-5 space-y-4" data-testid="task-budget">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-[#8A6A1F]" />
        <h2 className="text-sm font-semibold text-foreground">Budget</h2>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
        <div><span className="text-xs text-muted-foreground block">Task budget</span>
          <AmountEditor value={b.amount} label="this task" max={b.amount + b.projectRemaining}
            onSave={b.canSetTask ? async (v) => { await setTaskBudget(taskId, v); } : undefined} />
        </div>
        {hasSubs && <div><span className="text-xs text-muted-foreground block">Given to subtasks</span><span className="font-semibold">{fmtPKR(b.allocatedToSubtasks)}</span></div>}
        {hasSubs && <div><span className="text-xs text-muted-foreground block">Remaining</span><span className="font-semibold" data-testid="task-budget-remaining">{fmtPKR(b.remaining)}</span></div>}
        {b.canSetTask && <div className="text-xs text-muted-foreground">Project budget left: {fmtPKR(b.projectRemaining)}</div>}
      </div>
      {hasSubs && b.amount > 0 && <AllocationMeter given={b.allocatedToSubtasks} total={b.amount} givenLabel="Given to subtasks" leftLabel="Remaining" />}
      {hasSubs && (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-2">Subtask</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Budget</th><th className="px-4 py-2">Share</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {b.subtasks.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2"><Link to={`/subtasks/${s.id}`} className="hover:text-blue-600 hover:underline">{s.title}</Link></td>
                  <td className="px-4 py-2 text-muted-foreground">{s.status}</td>
                  <td className="px-4 py-2">
                    <AmountEditor value={s.amount} label={s.title} max={s.amount + b.remaining}
                      onSave={b.canAllocateSubtasks ? async (v) => { await setSubtaskBudget(s.id, v); } : undefined} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{b.amount > 0 ? `${((s.amount / b.amount) * 100).toFixed(0)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasSubs && b.canAllocateSubtasks && b.amount === 0 && <p className="text-xs text-amber-700">Give this task a budget first; then it can be split among its subtasks.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- subtask page line
export function SubtaskBudgetLine({ subtaskId }: { subtaskId: number }) {
  const q = useCachedQuery<SubtaskBudget | null>(["subtask", subtaskId, "budget"], () => getSubtaskBudget(subtaskId), null, { staleTime: FRESH.LIVE });
  const b = q.data;
  if (!b || !b.enabled) return null;
  return (
    <section className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm" data-testid="subtask-budget">
      <span className="inline-flex items-center gap-2 font-semibold"><Wallet size={15} className="text-[#8A6A1F]" /> Budget</span>
      <span><span className="text-xs text-muted-foreground block">This subtask</span>
        <AmountEditor value={b.amount} label="this subtask" max={b.amount + b.taskRemaining}
          onSave={b.canSet ? async (v) => { await setSubtaskBudget(subtaskId, v); } : undefined} />
      </span>
      <span><span className="text-xs text-muted-foreground block">Task budget</span>{fmtPKR(b.taskAmount)}</span>
      <span><span className="text-xs text-muted-foreground block">Left in the task</span>{fmtPKR(b.taskRemaining)}</span>
    </section>
  );
}
