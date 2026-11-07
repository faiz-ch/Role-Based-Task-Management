import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Shield,
  Building2,
  LogOut,
  Menu,
  Bell,
  FolderKanban,
  UserCircle,
} from "lucide-react";
import { Page } from "../types";
import { useAuth } from "../context/AuthContext";
import { InstitutionsFooter } from "./InstitutionsFooter";
import { toast } from "sonner";
import { ProfileDialog } from "./ProfileDialog";

const NAV: {
  id: Page;
  label: string;
  Icon: React.ElementType;
  perm: string | string[] | null;
}[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, perm: null },
  { id: "projects", label: "Projects", Icon: FolderKanban, perm: null },
  { id: "tasks", label: "Tasks", Icon: CheckSquare, perm: null },
  { id: "users", label: "Users", Icon: Users, perm: "user:manage" },
  { id: "roles", label: "Roles", Icon: Shield, perm: "role:manage" },
  { id: "organization", label: "Organization", Icon: Building2, perm: "organization:manage" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Mobile header: hides while scrolling down, comes back as soon as you scroll up. */
function useHideOnScroll(scrollRef: React.RefObject<HTMLElement | null>, resetKey: string, enabled: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mobile = window.matchMedia("(max-width: 899.98px)");
    let last = el.scrollTop;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = el.scrollTop;
        if (!mobile.matches || y < 72) setHidden(false); // always shown near the top
        else if (y > last + 6) setHidden(true); // scrolling down
        else if (y < last - 6) setHidden(false); // scrolling up
        last = y;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, enabled]);
  // new page → header visible again
  useEffect(() => setHidden(false), [resetKey]);
  return hidden;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { currentUser, permissions, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerHidden = useHideOnScroll(scrollRef, location.pathname, !!currentUser);

  // Derive current page from pathname
  const page: Page = (() => {
    const path = location.pathname;
    if (path === "/dashboard" || path.startsWith("/dashboard/")) return "dashboard";
    if (path.startsWith("/projects")) return "projects";
    if (path.startsWith("/tasks") || path.startsWith("/subtasks")) return "tasks";
    if (path.startsWith("/users")) return "users";
    if (path.startsWith("/roles")) return "roles";
    if (path.startsWith("/organization") || path.startsWith("/departments")) return "organization";
    return "tasks"; // default
  })();

  // New page: start at the top, close the account menu and clear old pop-ups
  // (error pop-ups stay until closed, but they belong to the page they came from)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
    toast.dismiss();
  }, [location.pathname]);

  if (!currentUser) return <>{children}</>;

  const visNav = NAV.filter(
    (n) => n.perm === null || (Array.isArray(n.perm) ? n.perm.some(p => permissions.includes(p)) : permissions.includes(n.perm))
  );
  const me = initials(currentUser.name);
  const roleName = currentUser.role?.name ?? "No role";

  return (
    <div className="rlk-shell">
      {/* ---------- Sidebar (desktop) ---------- */}
      <nav aria-label="Main" className={`rlk-side ${collapsed ? "rlk-side--collapsed" : ""}`}>
        <img src="/brand/rlk-logo-white.png" alt="" aria-hidden="true" className="rlk-side__watermark" />
        <div style={{ position: "relative" }}>
          <div className="rlk-brand">
            <img src="/brand/rlk-logo-gold.png" alt="RLK Group logo" />
            {!collapsed && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span className="rlk-brand__name">RLKG PMS</span>
                <span className="rlk-brand__sub">RLK Group</span>
              </div>
            )}
          </div>
          <div className="rlk-nav">
            {visNav.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigate(`/${id}`)}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                aria-current={page === id ? "page" : undefined}
                className="rlk-nav__item"
              >
                <Icon size={18} aria-hidden="true" />
                {!collapsed && <span>{label}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="rlk-me">
          <button type="button" className="rlk-me__open" onClick={() => setProfileOpen(true)} aria-label="Open my profile" title="My Profile">
            <span className="rlk-initials rlk-initials--gold" aria-hidden="true">{me}</span>
            {!collapsed && (
              <span className="rlk-me__text">
                <span className="rlk-me__name">{currentUser.name}</span>
                <span className="rlk-me__role">{roleName}</span>
              </span>
            )}
          </button>
          {!collapsed && (
            <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="rlk-iconbtn rlk-iconbtn--dark">
              <LogOut size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </nav>

      <div className="rlk-mainwrap">
        {/* ---------- Top bar (desktop) ---------- */}
        <header className="rlk-topbar">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className="rlk-iconbtn"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" aria-label="Notifications" className="rlk-iconbtn">
              <Bell size={19} aria-hidden="true" />
            </button>
            <button type="button" className="rlk-topbar__me" onClick={() => setProfileOpen(true)} aria-label="My Profile" title="My Profile">
              <span className="rlk-initials rlk-initials--ink" aria-hidden="true">{me}</span>
              <span>{currentUser.name}</span>
            </button>
          </div>
        </header>

        {/* ---------- Scrolling area: page + footer ---------- */}
        <div className="rlk-scroll" ref={scrollRef}>
          {/* Mobile header: the sidebar moves up here and hides while scrolling down */}
          <header className={`rlk-mhead ${headerHidden && !menuOpen ? "rlk-mhead--hidden" : ""}`}>
            <div className="rlk-mhead__row">
              <div className="rlk-mhead__brand">
                <img src="/brand/rlk-logo-gold.png" alt="RLK Group logo" />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>RLKG PMS</span>
                  <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#C9B98F" }}>RLK Group</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <button type="button" aria-label="Notifications" className="rlk-iconbtn rlk-iconbtn--dark">
                  <Bell size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Account: ${currentUser.name}`}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className="rlk-iconbtn"
                >
                  <span className="rlk-initials rlk-initials--gold" style={{ width: 34, height: 34 }}>{me}</span>
                </button>
              </div>
            </div>
            <div className="rlk-mnav" role="navigation" aria-label="Main">
              {visNav.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(`/${id}`)}
                  aria-current={page === id ? "page" : undefined}
                  className="rlk-mnav__item"
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            {menuOpen && (
              <div className="rlk-menu" role="menu">
                <div className="rlk-menu__who">
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{currentUser.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--rlk-muted)" }}>{roleName}</div>
                </div>
                <button type="button" role="menuitem" className="rlk-menu__btn" onClick={() => { setMenuOpen(false); setProfileOpen(true); }}>
                  <UserCircle size={16} aria-hidden="true" /> My Profile
                </button>
                <button type="button" role="menuitem" className="rlk-menu__btn" onClick={logout}>
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </header>

          <img src="/brand/rlk-logo-gold.png" alt="" aria-hidden="true" className="rlk-scroll__watermark" />
          <main className="rlk-page">{children}</main>
          <InstitutionsFooter />
        </div>
      </div>
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
