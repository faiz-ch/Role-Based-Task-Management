import React from "react";
import { Priority } from "../types";

export const PRIORITY_STYLE: Record<Priority, { dot: string; text: string }> = {
  Low: { dot: "bg-emerald-400", text: "text-emerald-700" },
  Medium: { dot: "bg-amber-400", text: "text-amber-700" },
  High: { dot: "bg-red-500", text: "text-red-700" },
};

export function PriBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY_STYLE[priority];
  if (!p) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {priority}
    </span>
  );
}
