import React, { useState, useEffect } from "react";
import { Plus, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { Role, Category, Department } from "../types";
import { getRoles, createRole, setRoleCategory, deleteRole, setRoleDepartments, setRoleAssignableCategories } from "../api/roles";
import { getCategories } from "../api/categories";
import { getDepartments } from "../api/departments";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

const DEPARTMENT_SCOPED_PERMISSIONS = new Set([
  "task:view",
  "task:assign",
  "user:view",
  "user:manage",
  "dashboard:view",
]);

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | "">("");
  const [newAllDepartments, setNewAllDepartments] = useState(false);
  const [newDepartmentIds, setNewDepartmentIds] = useState<number[]>([]);
  const [newAssignableCategoryIds, setNewAssignableCategoryIds] = useState<number[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedRoles, fetchedCategories, fetchedDepartments] = await Promise.all([
          getRoles(),
          getCategories(),
          getDepartments(),
        ]);
        setRoles(fetchedRoles);
        setCategories(fetchedCategories);
        setDepartments(fetchedDepartments);
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
  
  const selectedCategory = selected?.category;
  const hasDeptScopedPerms = selectedCategory?.permissions.some((p) => DEPARTMENT_SCOPED_PERMISSIONS.has(p));
  const hasUserManagePerm = selectedCategory?.permissions.includes("user:manage");
  
  const newCategory = categories.find((c) => c.id === (newCategoryId === "" ? null : Number(newCategoryId)));
  const newHasDeptScopedPerms = newCategory?.permissions.some((p) => DEPARTMENT_SCOPED_PERMISSIONS.has(p));
  const newHasUserManagePerm = newCategory?.permissions.includes("user:manage");

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

  async function handleDepartmentScopeChange(roleId: number, allDepartments: boolean, departmentIds: number[]) {
    try {
      setError(null);
      if (!allDepartments && departmentIds.length === 0) {
        setError("At least one department must be selected when not using 'All Departments'.");
        return;
      }
      const updatedRole = await setRoleDepartments(roleId, allDepartments, departmentIds);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? updatedRole : r)));
    } catch (err: any) {
      setError(err?.message || "Failed to update department scope.");
    }
  }

  async function handleAssignableCategoriesChange(roleId: number, assignableCategoryIds: number[]) {
    try {
      setError(null);
      const updatedRole = await setRoleAssignableCategories(roleId, assignableCategoryIds);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? updatedRole : r)));
    } catch (err: any) {
      setError(err?.message || "Failed to update assignable categories.");
    }
  }

  async function handleCreateRole() {
    if (!newName.trim()) return;
    try {
      setError(null);
      const categoryId = newCategoryId === "" ? null : Number(newCategoryId);
      const selectedCategory = categories.find((c) => c.id === categoryId);
      const hasDeptScopedPerms = selectedCategory?.permissions.some((p) => DEPARTMENT_SCOPED_PERMISSIONS.has(p));
      const hasUserManagePerm = selectedCategory?.permissions.includes("user:manage");
      
      if (hasDeptScopedPerms && !newAllDepartments && newDepartmentIds.length === 0) {
        setError("At least one department must be selected when not using 'All Departments'.");
        return;
      }
      
      const nr = await createRole(
        newName.trim(),
        categoryId,
        hasDeptScopedPerms ? newAllDepartments : false,
        hasDeptScopedPerms ? newDepartmentIds : [],
        hasUserManagePerm ? newAssignableCategoryIds : []
      );
      setRoles((prev) => [...prev, nr]);
      setSelectedId(nr.id);
      setNewName("");
      setNewCategoryId("");
      setNewAllDepartments(false);
      setNewDepartmentIds([]);
      setNewAssignableCategoryIds([]);
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
        <div className="lg:col-span-2 bg-white rounded-xl border border-border overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  {selected.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Category: {selected.category?.name || "No category assigned"}
                  {selected.category && (
                    <span className="ml-2 text-muted-foreground">
                      ({selected.category.permissions.length} permissions)
                    </span>
                  )}
                </p>
              </div>
              <div className="p-5 space-y-6">
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
                    Roles inherit permissions from their category. Department scope and assignable categories are configured per role.
                  </p>
                </div>
                
                {/* Departments section - only show if category has department-scoped permissions */}
                {hasDeptScopedPerms && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Departments</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`dept-scope-${selected.id}`}
                            checked={selected.allDepartments}
                            onChange={() => handleDepartmentScopeChange(selected.id, true, [])}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-sm font-medium">All Departments</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`dept-scope-${selected.id}`}
                            checked={!selected.allDepartments}
                            onChange={() => handleDepartmentScopeChange(selected.id, false, selected.departments.map((d) => d.id))}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-sm font-medium">Specific Departments</span>
                        </label>
                      </div>
                      {!selected.allDepartments && (
                        <div className="space-y-2">
                          {departments.map((dept) => {
                            const on = selected.departments.some((d) => d.id === dept.id);
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
                                  onChange={() => {
                                    const newIds = on
                                      ? selected.departments.filter((d) => d.id !== dept.id).map((d) => d.id)
                                      : [...selected.departments.map((d) => d.id), dept.id];
                                    handleDepartmentScopeChange(selected.id, false, newIds);
                                  }}
                                  className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold ${on ? "text-blue-700" : "text-foreground"}`}>
                                    {dept.name}
                                  </p>
                                </div>
                                {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Can Assign section - only show if category has user:manage permission */}
                {hasUserManagePerm && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Can Assign (when creating/editing users)</h4>
                    <div className="space-y-2">
                      {categories.map((cat) => {
                        const on = selected.assignableCategories.some((c) => c.id === cat.id);
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
                              onChange={() => {
                                const newIds = on
                                  ? selected.assignableCategories.filter((c) => c.id !== cat.id).map((c) => c.id)
                                  : [...selected.assignableCategories.map((c) => c.id), cat.id];
                                handleAssignableCategoriesChange(selected.id, newIds);
                              }}
                              className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${on ? "text-blue-700" : "text-foreground"}`}>
                                {cat.name}
                              </p>
                            </div>
                            {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              Select a role to manage its settings
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
            {/* Departments section - only show if category has department-scoped permissions */}
            {newHasDeptScopedPerms && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Departments</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="new-dept-scope"
                        checked={newAllDepartments}
                        onChange={() => setNewAllDepartments(true)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                      <span className="text-sm font-medium">All Departments</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="new-dept-scope"
                        checked={!newAllDepartments}
                        onChange={() => setNewAllDepartments(false)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                      <span className="text-sm font-medium">Specific Departments</span>
                    </label>
                  </div>
                  {!newAllDepartments && (
                    <div className="space-y-2">
                      {departments.map((dept) => {
                        const on = newDepartmentIds.includes(dept.id);
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
                              onChange={() => {
                                setNewDepartmentIds(
                                  on
                                    ? newDepartmentIds.filter((id) => id !== dept.id)
                                    : [...newDepartmentIds, dept.id]
                                );
                              }}
                              className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${on ? "text-blue-700" : "text-foreground"}`}>
                                {dept.name}
                              </p>
                            </div>
                            {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Can Assign section - only show if category has user:manage permission */}
            {newHasUserManagePerm && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Can Assign (when creating/editing users)</h4>
                <div className="space-y-2">
                  {categories.map((cat) => {
                    const on = newAssignableCategoryIds.includes(cat.id);
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
                          onChange={() => {
                            setNewAssignableCategoryIds(
                              on
                                ? newAssignableCategoryIds.filter((id) => id !== cat.id)
                                : [...newAssignableCategoryIds, cat.id]
                            );
                          }}
                          className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${on ? "text-blue-700" : "text-foreground"}`}>
                            {cat.name}
                          </p>
                        </div>
                        {on && <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              The new role will inherit permissions from its category. Department scope and assignable categories are configured per role.
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
