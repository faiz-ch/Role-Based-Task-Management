import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getAvatarUrl } from "../api/users";

/**
 * A person's picture: the photo when there is one, otherwise their initials.
 * Never both. If the photo fails to load, the initials take its place.
 *
 *   <UserAvatar user={user} size={40} />
 *   <UserAvatar user={user} size={96} shape="rounded" onOpen={() => setViewing(true)} />
 */
export interface AvatarPerson {
  id: number;
  name: string;
  hasAvatar?: boolean;
  avatarVersion?: string | null;
}

const COLORS = ["#7C3AED", "#2563EB", "#059669", "#EA580C", "#DB2777", "#4F46E5", "#0D9488"];

export function initialsOf(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function UserAvatar({
  user, size = 40, shape = "circle", tone, className = "", onOpen, label,
}: {
  user: AvatarPerson;
  size?: number;
  shape?: "circle" | "rounded";
  /** colours for the initials: "gold"/"ink" match the menu; default is a colour from the name */
  tone?: "gold" | "ink";
  className?: string;
  /** when given, clicking the photo calls this (e.g. to show it full size) */
  onOpen?: () => void;
  /** accessible text; defaults to the person's name */
  label?: string;
}) {
  const [broken, setBroken] = useState(false);
  // a new photo gets a new address; try it again even if the old one failed
  useEffect(() => setBroken(false), [user.id, user.avatarVersion, user.hasAvatar]);

  const showPhoto = !!user.hasAvatar && !broken;
  const radius = shape === "circle" ? "50%" : Math.round(size / 5);
  const box: React.CSSProperties = { width: size, height: size, borderRadius: radius, flexShrink: 0 };

  if (showPhoto) {
    const img = (
      <img
        src={getAvatarUrl(user.id, user.avatarVersion)}
        alt={label ?? user.name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setBroken(true)}
        style={{ ...box, objectFit: "cover", display: "block", background: "#EEE" }}
        className={className}
        data-testid="avatar-photo"
      />
    );
    if (!onOpen) return img;
    return (
      <button type="button" onClick={onOpen} aria-label={`View ${user.name}'s photo full size`} title="View full size"
        style={{ ...box, padding: 0, border: 0, background: "none", cursor: "zoom-in" }} className="rlk-avatar-btn">
        {img}
      </button>
    );
  }

  const colors = tone === "gold" ? { background: "var(--rlk-gold)", color: "var(--rlk-ink)" }
    : tone === "ink" ? { background: "var(--rlk-ink)", color: "var(--rlk-gold)" }
    : { background: COLORS[(user.name || "").charCodeAt(0) % COLORS.length || 0], color: "#fff" };
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={`select-none ${className}`}
      data-testid="avatar-initials"
      style={{
        ...box, ...colors, display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: Math.max(11, Math.round(size * 0.36)), letterSpacing: 0.3,
      }}
    >
      {initialsOf(user.name)}
    </span>
  );
}

/** Full-size photo on a dark background. Closes with Esc, the X, or a click outside the photo. */
export function PhotoViewer({ user, onClose }: { user: AvatarPerson; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${user.name}'s photo`} onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" data-testid="photo-viewer">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer">
        <X size={22} />
      </button>
      <figure onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-3 m-0">
        <img src={getAvatarUrl(user.id, user.avatarVersion)} alt={user.name}
          className="rounded-2xl shadow-2xl object-contain bg-white" style={{ width: "min(512px, 90vw)", maxHeight: "80vh" }} />
        <figcaption className="text-white text-sm font-semibold">{user.name}</figcaption>
      </figure>
    </div>
  );
}
