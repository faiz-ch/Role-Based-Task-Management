import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Page bar for long lists:
 *   Showing 51–60 of 1,868 · Rows per page [10] · « ‹ 1 … 4 5 [6] 7 8 … 187 › » · Go to [ ]
 * On phones it shrinks to: ‹ Page 6 of 187 ›
 */
export const PAGE_SIZES = [10, 25, 50, 100];

/** Which page numbers to show: always the first and last, two either side of the current one, "…" for gaps. */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, current - 2);
  const to = Math.min(total - 1, current + 2);
  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("gap");
  out.push(total);
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function Pager({
  page, pageSize, total, onPage, onPageSize, noun = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [goTo, setGoTo] = useState("");
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const go = (p: number) => onPage(Math.min(pages, Math.max(1, p)));

  function submitGoTo() {
    const n = Number(goTo);
    if (Number.isFinite(n) && n >= 1) go(Math.floor(n));
    setGoTo("");
  }

  const btn = "h-8 min-w-8 px-2 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default";
  const plain = `${btn} text-muted-foreground hover:bg-muted disabled:hover:bg-transparent`;

  return (
    <nav aria-label="Pages" className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3" data-testid="pager">
      <span className="text-xs text-muted-foreground" data-testid="pager-range">
        Showing {fmt(first)}–{fmt(last)} of {fmt(total)} {noun}
      </span>

      {/* Phones: compact */}
      <div className="flex sm:hidden items-center gap-1">
        <button type="button" className={plain} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="text-sm text-foreground px-2" data-testid="pager-compact">Page {fmt(page)} of {fmt(pages)}</span>
        <button type="button" className={plain} onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>

      {/* Larger screens: full */}
      <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Rows per page
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page"
            className="h-8 px-2 text-sm border border-border rounded-lg bg-white text-foreground cursor-pointer">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-0.5">
          <button type="button" className={plain} onClick={() => go(1)} disabled={page <= 1} aria-label="First page" title="First page"><ChevronsLeft size={16} /></button>
          <button type="button" className={plain} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page" title="Previous page"><ChevronLeft size={16} /></button>
          {pageWindow(page, pages).map((p, i) => p === "gap"
            ? <span key={`g${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">…</span>
            : (
              <button key={p} type="button" onClick={() => go(p)} aria-label={`Page ${p}`} aria-current={p === page ? "page" : undefined}
                className={p === page ? `${btn} bg-[#15171C] text-white` : plain}>
                {fmt(p)}
              </button>
            ))}
          <button type="button" className={plain} onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page" title="Next page"><ChevronRight size={16} /></button>
          <button type="button" className={plain} onClick={() => go(pages)} disabled={page >= pages} aria-label="Last page" title="Last page"><ChevronsRight size={16} /></button>
        </div>

        {pages > 7 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Go to
            <input inputMode="numeric" value={goTo} placeholder={String(page)} aria-label="Go to page"
              onChange={(e) => setGoTo(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") submitGoTo(); }}
              onBlur={() => goTo && submitGoTo()}
              className="h-8 w-16 px-2 text-sm border border-border rounded-lg bg-white text-foreground" />
          </label>
        )}
      </div>
    </nav>
  );
}
