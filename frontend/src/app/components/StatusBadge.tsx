import React from "react";
import { Status } from "../types";

export const STATUS_STYLE: Record<
  Status,
  { badge: string; dot: string; colTop: string; colBg: string }
> = {
  "To Do": {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    colTop: "border-t-slate-400",
    colBg: "",
  },
  "In Progress": {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    colTop: "border-t-blue-500",
    colBg: "bg-blue-50/20",
  },
  Review: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    colTop: "border-t-amber-500",
    colBg: "bg-amber-50/20",
  },
  Done: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    colTop: "border-t-emerald-500",
    colBg: "bg-emerald-50/20",
  },
  Rejected: {
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    colTop: "border-t-red-500",
    colBg: "bg-red-50/20",
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  if (!s) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${s.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {status}
    </span>
  );
}
