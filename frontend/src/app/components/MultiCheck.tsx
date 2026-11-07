import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

/**
 * Searchable tick-box list for choosing several items (e.g. a station's
 * departments, or a department's stations).
 */
export function MultiCheck({
  label,
  help,
  options,
  selectedIds,
  onChange,
  emptyText = "Nothing to choose from yet.",
  idPrefix,
}: {
  label: string;
  help?: string;
  options: { id: number; name: string; hint?: string | null }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyText?: string;
  idPrefix: string;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()) || (o.hint ?? "").toLowerCase().includes(q.trim().toLowerCase())),
    [options, q]
  );
  const toggle = (id: number) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
      </div>
      {help && <p className="text-xs text-muted-foreground -mt-0.5">{help}</p>}
      {options.length > 6 && (
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={`${idPrefix}-search`}
            aria-label={`Search ${label}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      )}
      <div className="border border-border rounded-lg max-h-52 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1 py-2 col-span-full">{emptyText}</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1 py-2 col-span-full">No match.</p>
        ) : (
          shown.map((o) => (
            <label key={o.id} htmlFor={`${idPrefix}-${o.id}`} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer">
              <input
                id={`${idPrefix}-${o.id}`}
                type="checkbox"
                className="w-4 h-4 mt-0.5 accent-blue-600"
                checked={selectedIds.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span className="text-sm text-foreground leading-snug">
                {o.name}
                {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
