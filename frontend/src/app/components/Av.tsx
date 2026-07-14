import React from "react";

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function initials(name: string) {
  if (!name) return "";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Av({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const idx = (name || "").charCodeAt(0) % AVATAR_COLORS.length;
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm";
  return (
    <div
      className={`${sz} ${AVATAR_COLORS[idx]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 select-none`}
    >
      {initials(name)}
    </div>
  );
}
