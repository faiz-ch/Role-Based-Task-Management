import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

/**
 * A dropdown with a search box and tick boxes: choose any number of options.
 * Nothing ticked = "all" (the placeholder is shown).
 *
 *   <MultiSelect label="Station filter" placeholder="All stations" noun="stations"
 *     options={[{ value: "1", label: "RLMC" }]} values={["1"]} onChange={...} />
 */
export interface MSOption {
  value: string;
  label: string;
  hint?: string | null;
}

export function MultiSelect({
  label, placeholder, noun, options, values, onChange, className = "", searchThreshold = 4,
}: {
  /** accessible name of the button, e.g. "Station filter" */
  label: string;
  /** shown when nothing is chosen, e.g. "All stations" */
  placeholder: string;
  /** plural used in "3 stations" */
  noun: string;
  options: MSOption[];
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
  searchThreshold?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // focus the search box once the panel is shown (without scrolling the page)
  useLayoutEffect(() => {
    if (open && options.length > searchThreshold) searchRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleOpen() {
    if (!open && wrapRef.current) {
      // keep the panel on screen: open to the left when near the right edge
      const r = wrapRef.current.getBoundingClientRect();
      setAlignRight(r.left + 280 > window.innerWidth - 8);
    }
    setOpen((o) => !o);
  }

  const chosen = new Set(values);
  const byValue = new Map(options.map((o) => [o.value, o]));
  const chosenLabels = values.map((v) => byValue.get(v)?.label).filter(Boolean) as string[];
  const summary = chosenLabels.length === 0 ? placeholder
    : chosenLabels.length === 1 ? chosenLabels[0]
    : chosenLabels.length === 2 && (chosenLabels[0].length + chosenLabels[1].length) < 22 ? chosenLabels.join(", ")
    : `${chosenLabels.length} ${noun}`;

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;

  const toggle = (v: string) => onChange(chosen.has(v) ? values.filter((x) => x !== v) : [...values, v]);
  const selectShown = () => onChange([...new Set([...values, ...shown.map((o) => o.value)])]);

  return (
    <div ref={wrapRef} className={`rlk-ms ${className}`}>
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        className={`rlk-ms__btn${values.length ? " rlk-ms__btn--on" : ""}`} onClick={toggleOpen}>
        <span className="rlk-ms__summary" title={chosenLabels.join(", ") || placeholder}>{summary}</span>
        {values.length > 1 && <span className="rlk-ms__count">{values.length}</span>}
        <ChevronDown size={15} aria-hidden="true" className="rlk-ms__chev" />
      </button>

      {open && (
        <div className={`rlk-ms__panel${alignRight ? " rlk-ms__panel--right" : ""}`} role="listbox" aria-multiselectable="true" aria-label={label}>
          {options.length > searchThreshold && (
            <div className="rlk-ms__search">
              <Search size={14} aria-hidden="true" />
              <input ref={searchRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`} />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}
            </div>
          )}
          <div className="rlk-ms__list">
            {shown.length === 0 && <p className="rlk-ms__empty">{options.length ? "No matches." : `No ${noun} to choose.`}</p>}
            {shown.map((o) => (
              <label key={o.value} className="rlk-ms__opt">
                <input type="checkbox" checked={chosen.has(o.value)} onChange={() => toggle(o.value)} aria-label={o.label} />
                <span className="rlk-ms__optlabel">{o.label}{o.hint && <small>{o.hint}</small>}</span>
              </label>
            ))}
          </div>
          <div className="rlk-ms__foot">
            <button type="button" onClick={selectShown} disabled={shown.length === 0}>{q ? "Tick all shown" : "Tick all"}</button>
            <button type="button" onClick={() => onChange([])} disabled={values.length === 0}>Clear</button>
            <button type="button" className="rlk-ms__done" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small removable tags for what is chosen across several filters. */
export function FilterChips({ chips, onClearAll }: { chips: { key: string; label: string; onRemove: () => void }[]; onClearAll?: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="rlk-chips" data-testid="filter-chips">
      {chips.map((c) => (
        <span key={c.key} className="rlk-chip">
          {c.label}
          <button type="button" aria-label={`Remove ${c.label}`} onClick={c.onRemove}><X size={12} /></button>
        </span>
      ))}
      {onClearAll && chips.length > 1 && <button type="button" className="rlk-chips__all" onClick={onClearAll}>Clear all</button>}
    </div>
  );
}

/** number[] <-> string[] helpers for id filters */
export const idsToValues = (ids: number[]) => ids.map(String);
export const valuesToIds = (vals: string[]) => vals.map(Number).filter((n) => Number.isFinite(n));
