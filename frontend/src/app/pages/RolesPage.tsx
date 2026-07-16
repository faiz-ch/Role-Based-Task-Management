import React, { useState, useEffect } from "react";
import { Plus, AlertTriangle, Trash2 } from "lucide-react";
import { Role, Category } from "../types";
import { getRoles, createRole, setRoleCategory, deleteRole } from "../api/roles";
import { getCategories } from "../api/categories";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | "">("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedRoles, fetchedCategories] = await Promise.all([
          getRoles(),
          getCategories(),
        ]);
        setRoles(fetchedRoles);
        setCategories(fetchedCategories);
        if (fetchedRoles.length > 0) {
          setSelectedId(fetchedRoles[0].id);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load roles data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selected = roles.find((r) => r.id === selectedId);

  async function handleCategoryChange(roleId: number, categoryIdStr: string) {
    try {
      setError(null);
      const categoryId = categoryIdStr === "" ? null : Number(categoryIdStr);
      const updatedRole = await setRoleCategory(roleId, categoryId);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? updatedRole : r)));
    } catch (err: any) {
      setError(err?.message || "Failed to update role category.");
    }
  }

  async function handleCreateRole() {
    if (!newName.trim()) return;
    try {
      setError(null);
      const categoryId = newCategoryId === "" ? null : Number(newCategoryId);
      const nr = await createRole(newName.trim(), categoryId);
      setRoles((prev) => [...prev, nr]);
      setSelectedId(nr.id);
      setNewName("");
      setNewCategoryId("");
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
        <h1 className="text-xl font-bold text-foreground">Roles</h1>
        <p className="text-sm text-muted-foreground">Define role names and assign them to categories</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  <span className="text-xs text-muted-foreground">
                    {role.category?.name || "No category"}
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

        {/* Role details */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  {selected.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Category: {selected.category?.name || "No category assigned"}
                </p>
              </div>
              <div className="p-5">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                  <select
                    value={selected.category?.id ?? ""}
                    onChange={(e) => handleCategoryChange(selected.id, e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-foreground focus:outline-none focus:border-blue-400"
                  >
                    <option value="">No category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Roles inherit all permissions and department scopes from their category. 
                    Configure permissions and departments in the Categories page.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              Select a role to manage its category
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
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category (optional)</label>
              <select
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-foreground focus:outline-none focus:border-blue-400"
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The new role will inherit all permissions and department scopes from its category. 
              Configure categories in the Categories page.
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
