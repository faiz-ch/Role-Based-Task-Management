import React from "react";
import { Lock } from "lucide-react";
import { ApprovalType } from "../api/approvals";

/**
 * "Required approvals" on the project form: tick the approvals this project needs.
 * Mandatory types are always ticked. Approvals already requested (`lockedIds`) cannot be unticked.
 */
export function RequiredApprovalsPicker({ types, value, onChange, lockedIds = [] }: {
  types: ApprovalType[]; value: number[]; onChange: (ids: number[]) => void; lockedIds?: number[];
}) {
  const shown = types.filter((t) => t.isActive || value.includes(t.id));
  if (shown.length === 0) return null;
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-col gap-1.5" data-testid="required-approvals">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required approvals</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {shown.map((t) => {
          const forced = t.mandatory;
          const locked = lockedIds.includes(t.id);
          const checked = forced || value.includes(t.id);
          return (
            <label key={t.id} className={`flex items-start gap-2.5 p-2.5 border rounded-lg text-sm ${checked ? "border-[#B08C2E] bg-[#FFFCF4]" : "border-border"} ${forced || locked ? "" : "cursor-pointer hover:bg-muted/30"}`}>
              <input type="checkbox" className="w-4 h-4 accent-blue-600 mt-0.5" aria-label={`Approval ${t.name}`} checked={checked}
                disabled={forced || (locked && value.includes(t.id))} onChange={() => toggle(t.id)} />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{t.name}</span>
                {(forced || locked) && <Lock size={11} className="inline ml-1 text-muted-foreground" />}
                <span className="block text-xs text-muted-foreground">
                  {forced ? "Required for every project" : locked ? "Already requested" : t.description || (t.requiresAmount ? "With an amount" : "")}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
