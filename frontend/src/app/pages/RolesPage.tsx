import React, { useState, useEffect } from "react";
import { Plus, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { Role, PermDef } from "../types";
import { getRoles, createRole, setRolePermissions, getAllPermissions, deleteRole } from "../api/roles";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

const PERM_DESCRIPTIONS: Record<string, string> = {
  "task:create": "Create new tasks",
  "task:edit": "Edit and delete tasks",
  "task:assign": "Assign tasks to users",
  "role:manage": "Create and configure roles",
  "user:manage": "Manage users and status",
  "dashboard:view": "View analytics dashboard",
};

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermDef[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedRoles, fetchedPerms] = await Promise.all([
          getRoles(),
          getAllPermissions(),
        ]);
        setRoles(fetchedRoles);
        setAllPermissions(fetchedPerms);
        if (fetchedRoles.length > 0) {
          setSelectedId(fetchedRoles[0].id);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load roles and permissions data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selected = roles.find((r) => r.id === selectedId);

  async function togglePerm(permId: number) {
    if (!selected) return;
    try {
      setError(null);
      const has = selected.permissionIds.includes(permId);
      const newIds = has
        ? selected.permissionIds.filter((id) => id !== permId)
        : [...selected.permissionIds, permId];
      const updatedRole = await setRolePermissions(selected.id, newIds);
      setRoles((prev) =>
        prev.map((r) => (r.id === selected.id ? updatedRole : r))
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update permissions.");
    }
  }

  async function handleCreateRole() {
    if (!newName.trim()) return;
    try {
      setError(null);
      const nr = await createRole(newName.trim());
      setRoles((prev) => [...prev, nr]);
      setSelectedId(nr.id);
      setNewName("");
      setShowNew(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create role.");
    }
  }

  async function handleDeleteRole(roleId: number) {
    try {
      setError(null);
      await deleteRole(roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      if (selectedId === roleId) {
        setSelectedId(roles.find((r) => r.id !== roleId)?.id || "");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to delete role.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading roles...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">Define what each role can do in the system</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Role list */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Roles</span>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors cursor-pointer"
            >
              <Plus size={12} /> New
            </button>
          </div>
          <div className="divide-y divide-border">
            {roles.map((role) => (
              <div
                key={role.id}
                className={`flex items-center justify-between px-4 py-3.5 text-sm transition-colors ${
                  selectedId === role.id
                    ? "bg-blue-50 text-blue-700 font-semibold border-r-2 border-r-blue-500"
                    : "text-foreground hover:bg-muted/40 font-medium"
                }`}
              >
                <button
                  onClick={() => setSelectedId(role.id)}
                  className="flex-1 text-left cursor-pointer"
                >
                  {role.name}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {role.permissionIds.length}/{allPermissions.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRole(role.id);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Delete role"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Permission checkboxes */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  Permissions — <span className="text-blue-600">{selected.name}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selected.permissionIds.length} of {allPermissions.length} granted
                </p>
              </div>
              <div className="p-5 space-y-2">
                {allPermissions.map((perm) => {
                  const on = selected.permissionIds.includes(perm.id);
                  const desc = PERM_DESCRIPTIONS[perm.name] || "System permission";
                  return (
                    <label
                      key={perm.id}
                      className={`flex items-center gap-3.5 p-3.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                        on ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePerm(perm.id)}
                        className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-mono font-semibold ${
                            on ? "text-blue-700" : "text-foreground"
                          }`}
                        >
                          {perm.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              Select a role to manage its permissions
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <Dlg title="Create Role" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <FldInput
              label="Role name"
              placeholder="e.g. Team Lead"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              The new role starts with no permissions. Select it after creation to assign what it
              can do.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Create Role
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
