import React, { useState, useEffect } from "react";
import { Plus, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { Category, PermDef, Department } from "../types";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../api/categories";
import { getAllPermissions } from "../api/roles";
import { getDepartments } from "../api/departments";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

const PERM_DESCRIPTIONS: Record<string, string> = {
  // Task permissions
  "task:create": "Create new tasks",
  "task:edit": "Edit task details",
  "task:delete": "Delete tasks",
  "task:review": "Review and approve/reject tasks",
  "task:view_all": "View all tasks across the system",
  "task:view_department": "View tasks in your department",
  "task:assign_all": "Assign tasks to any user",
  "task:assign_department": "Assign tasks within your department",
  // User permissions
  "user:view_all": "View all users in the system",
  "user:view_department": "View users in your department",
  "user:manage_all": "Manage all users and their settings",
  "user:manage_department": "Manage users within your department",
  // Role & Department permissions
  "role:manage": "Create and configure roles",
  "department:manage": "Manage departments",
  // Dashboard permissions
  "dashboard:view_all": "View dashboard for all tasks",
  "dashboard:view_department": "View dashboard for your department",
};

const DEPARTMENT_SCOPED_PERMISSIONS = new Set([
  "task:view_department",
  "task:assign_department",
  "user:view_department",
  "user:manage_department",
  "dashboard:view_department",
]);

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermDef[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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
        const [fetchedCategories, fetchedPerms, fetchedDepartments] = await Promise.all([
          getCategories(),
          getAllPermissions(),
          getDepartments(),
        ]);
        setCategories(fetchedCategories);
        setAllPermissions(fetchedPerms);
        setDepartments(fetchedDepartments);
        if (fetchedCategories.length > 0) {
          setSelectedId(fetchedCategories[0].id);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load categories data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selected = categories.find((c) => c.id === selectedId);

  async function togglePerm(permId: number) {
    if (!selected) return;
    try {
      setError(null);
      const perm = allPermissions.find((p) => p.id === permId);
      if (!perm) return;
      
      const has = selected.permissions.includes(perm.name);
      const newPerms = has
        ? selected.permissions.filter((p) => p !== perm.name)
        : [...selected.permissions, perm.name];
      
      const permIds = newPerms
        .map((name) => allPermissions.find((p) => p.name === name)?.id)
        .filter((id): id is number => id !== undefined);
      
      const updatedCategory = await updateCategory(
        selected.id,
        null,
        permIds,
        null,
        null
      );
      setCategories((prev) =>
        prev.map((c) => (c.id === selected.id ? updatedCategory : c))
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update permissions.");
    }
  }

  async function toggleDepartment(deptId: number) {
    if (!selected) return;
    try {
      setError(null);
      const has = selected.departmentIds.includes(deptId);
      const newDeptIds = has
        ? selected.departmentIds.filter((id) => id !== deptId)
        : [...selected.departmentIds, deptId];
      
      const updatedCategory = await updateCategory(
        selected.id,
        null,
        null,
        newDeptIds,
        null
      );
      setCategories((prev) =>
        prev.map((c) => (c.id === selected.id ? updatedCategory : c))
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update departments.");
    }
  }

  async function toggleAssignableCategory(catId: number) {
    if (!selected) return;
    try {
      setError(null);
      const has = selected.assignableCategoryIds.includes(catId);
      const newAssignableIds = has
        ? selected.assignableCategoryIds.filter((id) => id !== catId)
        : [...selected.assignableCategoryIds, catId];
      
      const updatedCategory = await updateCategory(
        selected.id,
        null,
        null,
        null,
        newAssignableIds
      );
      setCategories((prev) =>
        prev.map((c) => (c.id === selected.id ? updatedCategory : c))
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update assignable categories.");
    }
  }

  async function handleCreateCategory() {
    if (!newName.trim()) return;
    try {
      setError(null);
      const nc = await createCategory(newName.trim(), [], [], []);
      setCategories((prev) => [...prev, nc]);
      setSelectedId(nc.id);
      setNewName("");
      setShowNew(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create category.");
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    try {
      setError(null);
      await deleteCategory(categoryId);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      if (selectedId === categoryId) {
        setSelectedId(categories.find((c) => c.id !== categoryId)?.id || "");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to delete category.");
    }
  }

  const hasDepartmentScopedPerms = selected?.permissions.some((p) =>
    DEPARTMENT_SCOPED_PERMISSIONS.has(p)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading categories...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Categories</h1>
        <p className="text-sm text-muted-foreground">Define permission bundles and department scopes for roles</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Category list */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Categories</span>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors cursor-pointer"
            >
              <Plus size={12} /> New
            </button>
          </div>
          <div className="divide-y divide-border">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`flex items-center justify-between px-4 py-3.5 text-sm transition-colors ${
                  selectedId === category.id
                    ? "bg-blue-50 text-blue-700 font-semibold border-r-2 border-r-blue-500"
                    : "text-foreground hover:bg-muted/40 font-medium"
                }`}
              >
                <button
                  onClick={() => setSelectedId(category.id)}
                  className="flex-1 text-left cursor-pointer"
                >
                  {category.name}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {category.permissions.length}/{allPermissions.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(category.id);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category details */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  {selected.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selected.permissions.length} of {allPermissions.length} permissions granted
                </p>
              </div>
              <div className="p-5 space-y-6">
                {/* Permissions */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Permissions</h4>
                  <div className="space-y-2">
                    {allPermissions.map((perm) => {
                      const on = selected.permissions.includes(perm.name);
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
                </div>
                
                {/* Departments - only show if has department-scoped permissions */}
                {hasDepartmentScopedPerms && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Departments</h4>
                    <div className="space-y-2">
                      {departments.map((dept) => {
                        const on = selected.departmentIds.includes(dept.id);
                        return (
                          <label
                            key={dept.id}
                            className={`flex items-center gap-3.5 p-3.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                              on ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/30"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleDepartment(dept.id)}
                              className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-semibold ${
                                  on ? "text-blue-700" : "text-foreground"
                                }`}
                              >
                                {dept.name}
                              </p>
                            </div>
                            {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Can Assign */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Can Assign (when creating/editing users)</h4>
                  <div className="space-y-2">
                    {categories.map((cat) => {
                      const on = selected.assignableCategoryIds.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          className={`flex items-center gap-3.5 p-3.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                            on ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleAssignableCategory(cat.id)}
                            className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-semibold ${
                                on ? "text-blue-700" : "text-foreground"
                              }`}
                            >
                              {cat.name} {cat.id === selected.id && "(self)"}
                            </p>
                          </div>
                          {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              Select a category to manage its settings
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <Dlg title="Create Category" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <FldInput
              label="Category name"
              placeholder="e.g. Departmental Manager"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              The new category starts with no permissions or departments. Select it after creation to configure what it can do and which departments it can access.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCategory}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Create Category
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
