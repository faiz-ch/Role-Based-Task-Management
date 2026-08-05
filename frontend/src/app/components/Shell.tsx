import React, { useState } from "react";
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
  Layers,
  FolderKanban,
} from "lucide-react";
import { Page } from "../types";
import { useAuth } from "../context/AuthContext";
import { Av } from "./Av";

const NAV: {
  id: Page;
  label: string;
  Icon: React.ElementType;
  perm: string | string[] | null;
}[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, perm: "dashboard:view" },
  { id: "projects", label: "Projects", Icon: FolderKanban, perm: null },
  { id: "tasks", label: "Tasks", Icon: CheckSquare, perm: null },
  { id: "users", label: "Users", Icon: Users, perm: "user:manage" },
  { id: "roles", label: "Roles", Icon: Shield, perm: "role:manage" },
  { id: "categories", label: "Categories", Icon: Layers, perm: "role:manage" },
  { id: "departments", label: "Departments", Icon: Building2, perm: "department:manage" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { currentUser, permissions, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Derive current page from pathname
  const page: Page = (() => {
    const path = location.pathname;
    if (path === "/dashboard") return "dashboard";
    if (path.startsWith("/projects")) return "projects";
    if (path.startsWith("/tasks")) return "tasks";
    if (path === "/users") return "users";
    if (path === "/roles") return "roles";
    if (path === "/categories") return "categories";
    if (path === "/departments") return "departments";
    return "tasks"; // default
  })();

  if (!currentUser) return <>{children}</>;

  const visNav = NAV.filter(
    (n) => n.perm === null || (Array.isArray(n.perm) ? n.perm.some(p => permissions.includes(p)) : permissions.includes(n.perm))
  );

  return (
    <div
      className="h-screen flex bg-background overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden"
        style={{ width: collapsed ? "56px" : "220px", background: "#0C1022" }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 h-14 px-3.5 border-b flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckSquare size={14} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-white font-semibold tracking-tight text-sm">
              RLKU PMS
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {visNav.map(({ id, label, Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => navigate(`/${id}`)}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all text-sm font-medium cursor-pointer ${
                  active
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-slate-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <Icon size={15} className="flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User card */}
        <div
          className="border-t p-2.5 flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <div className="flex items-center gap-2.5">
            <Av name={currentUser.name} />
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {currentUser.name}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "rgba(148,163,184,0.7)" }}
                  >
                    {currentUser.role?.name ?? "No role"}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/10 cursor-pointer"
                  title="Sign out"
                >
                  <LogOut size={13} className="text-slate-400" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-border flex items-center gap-3 px-5 flex-shrink-0">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
          >
            <Menu size={15} className="text-muted-foreground" />
          </button>
          <div className="flex-1" />
          <button className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer">
            <Bell size={15} className="text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 pl-3 border-l border-border">
            <Av name={currentUser.name} />
            <span className="text-sm font-medium text-foreground hidden sm:block">
              {currentUser.name}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50/50">{children}</main>
      </div>
    </div>
  );
}