import React, { useEffect, useMemo, useRef } from "react";
import { PermDef } from "../types";

/**
 * One tick box per MODULE (Department, Project, Role, Task, User).
 * Ticking a module grants every permission in it (e.g. Project = view + manage).
 * The backend still stores the individual permissions, so nothing changes there.
 */

const MODULE_INFO: Record<string, { label: string; description: string }> = {
  department: { label: "Departments", description: "Create, edit and delete departments" },
  project: { label: "Projects", description: "View and manage projects, teams, meetings and files" },
  role: { label: "Roles", description: "Create and edit roles and their permissions" },
  task: { label: "Tasks", description: "Create and manage tasks" },
  user: { label: "Users", description: "View, create and edit user accounts" },
};

function moduleOf(perm: PermDef) {
  return perm.name.split(":")[0];
}

export function groupPermissionsByModule(allPermissions: PermDef[]): Record<string, PermDef[]> {
  const modules: Record<string, PermDef[]> = {};
  allPermissions.forEach((perm) => {
    const m = moduleOf(perm);
    if (!modules[m]) modules[m] = [];
    modules[m].push(perm);
  });
  return modules;
}

/** True if every permission of `moduleName` is in selectedIds. */
export function hasModule(allPermissions: PermDef[], selectedIds: number[], moduleName: string): boolean {
  const perms = allPermissions.filter((p) => moduleOf(p) === moduleName);
  return perms.length > 0 && perms.every((p) => selectedIds.includes(p.id));
}

function ModuleCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-blue-600 mt-0.5" />;
}

export function PermissionModulePicker({
  allPermissions,
  selectedIds,
  onChange,
}: {
  allPermissions: PermDef[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const modules = useMemo(() => groupPermissionsByModule(allPermissions), [allPermissions]);
  const moduleNames = Object.keys(modules).sort();
  const allIds = allPermissions.map((p) => p.id);
  const everything = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  function toggleModule(name: string) {
    const ids = modules[name].map((p) => p.id);
    const full = ids.every((id) => selectedIds.includes(id));
    if (full) {
      onChange(selectedIds.filter((id) => !ids.includes(id)));
    } else {
      onChange([...new Set([...selectedIds, ...ids])]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-foreground">Permissions</label>
        <button
          type="button"
          onClick={() => onChange(everything ? [] : allIds)}
          className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          {everything ? "Clear All" : "Select All"}
        </button>
      </div>
      <div className="border border-border rounded-lg divide-y divide-border">
        {moduleNames.map((name) => {
          const perms = modules[name];
          const count = perms.filter((p) => selectedIds.includes(p.id)).length;
          const info = MODULE_INFO[name] ?? { label: name.charAt(0).toUpperCase() + name.slice(1), description: "" };
          const actions = perms.map((p) => p.name.split(":")[1]).join(" + ");
          return (
            <label key={name} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30">
              <ModuleCheckbox
                checked={count === perms.length}
                indeterminate={count > 0 && count < perms.length}
                onChange={() => toggleModule(name)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{info.label}</span>
                  <span className="text-xs text-muted-foreground">({actions})</span>
                </div>
                {info.description && <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>}
              </div>
            </label>
          );
        })}
        {moduleNames.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">No permissions available</p>
        )}
      </div>
    </div>
  );
}
