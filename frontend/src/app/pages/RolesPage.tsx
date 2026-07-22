import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, AlertTriangle, Trash2, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";
import { Role, Category, Department } from "../types";
import { getRoles, createRole, setRoleCategory, deleteRole, setRoleDepartments, setRoleAssignableCategories, setRoleNotifications } from "../api/roles";
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

const SAVE_DEBOUNCE_MS = 500;

// A plain checklist with a "Select All" row at the top. Used for both the
// department scope and the assignable-categories sections, since both are
// really "which of these things apply" pickers.
function SelectAllChecklist<T extends { id: number; name: string }>({
  items,
  selectedIds,
  onToggleAll,
  onToggleOne,
}: {
  items: T[];
  selectedIds: number[];
  onToggleAll: (selectAll: boolean) => void;
  onToggleOne: (id: number) => void;
}) {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="grid grid-cols-2 gap-2">
      <label
        className={`col-span-2 flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
          allSelected ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/30"
        }`}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onToggleAll(!allSelected)}
          className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
        />
        <p className={`text-sm font-semibold ${allSelected ? "text-blue-700" : "text-foreground"}`}>
          Select All
        </p>
        {allSelected && <CheckCircle2 size={14} className="text-blue-500 flex-shrink-0 ml-auto" />}
      </label>
      {items.map((item) => {
        const on = selectedIds.includes(item.id);
        return (
          <label
            key={item.id}
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
              on ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/30"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggleOne(item.id)}
              className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
            />
            <p className={`text-sm font-medium truncate ${on ? "text-blue-700" : "text-foreground"}`}>
              {item.name}
            </p>
          </label>
        );
      })}
    </div>
  );
}

// Thin progress bar at the top of the wizard — one filled segment per step,
// current + completed steps are filled, upcoming steps are dim.
function WizardProgress({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i <= current ? "bg-blue-500" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | "">("");
  const [newAllDepartments, setNewAllDepartments] = useState(false);
  const [newDepartmentIds, setNewDepartmentIds] = useState<number[]>([]);
  const [newAssignableCategoryIds, setNewAssignableCategoryIds] = useState<number[]>([]);
  const [newNotifyOnAssign, setNewNotifyOnAssign] = useState(false);
  const [newNotifyOnReview, setNewNotifyOnReview] = useState(false);
  const [newNotifyOnReschedule, setNewNotifyOnReschedule] = useState(false);
  const [newNotifyOnDone, setNewNotifyOnDone] = useState(false);

  // Local drafts for the selected role's editable sections. These update
  // instantly on click (no waiting on the network), and are the single
  // source of truth for what's checked — the actual save is debounced and
  // never derives its payload from a possibly-stale server response, which
  // is what caused the "click twice, other box unchecks" race before.
  const [deptDraft, setDeptDraft] = useState<{ allDepartments: boolean; departmentIds: number[] }>({
    allDepartments: false,
    departmentIds: [],
  });
  const [assignableDraft, setAssignableDraft] = useState<number[]>([]);
  const [notificationDraft, setNotificationDraft] = useState<{
    notifyOnAssign: boolean;
    notifyOnReview: boolean;
    notifyOnReschedule: boolean;
    notifyOnDone: boolean;
  }>({
    notifyOnAssign: false,
    notifyOnReview: false,
    notifyOnReschedule: false,
    notifyOnDone: false,
  });
  const deptSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignableSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Re-sync the drafts whenever the selected role changes (switching roles,
  // or the initial load). We deliberately do NOT re-sync on every `roles`
  // change, so a save-in-flight for the currently selected role doesn't
  // reset what the user is actively clicking.
  useEffect(() => {
    if (selected) {
      setDeptDraft({
        allDepartments: selected.allDepartments,
        departmentIds: selected.departments.map((d) => d.id),
      });
      setAssignableDraft(selected.assignableCategories.map((c) => c.id));
      setNotificationDraft({
        notifyOnAssign: selected.notifyOnAssign,
        notifyOnReview: selected.notifyOnReview,
        notifyOnReschedule: selected.notifyOnReschedule,
        notifyOnDone: selected.notifyOnDone,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectedCategory = selected?.category;
  const hasDeptScopedPerms = selectedCategory?.permissions.some((p) => DEPARTMENT_SCOPED_PERMISSIONS.has(p));
  const hasUserManagePerm = selectedCategory?.permissions.includes("user:manage");

  const newCategory = categories.find((c) => c.id === (newCategoryId === "" ? null : Number(newCategoryId)));
  const newHasDeptScopedPerms = !!newCategory?.permissions.some((p) => DEPARTMENT_SCOPED_PERMISSIONS.has(p));
  const newHasUserManagePerm = !!newCategory?.permissions.includes("user:manage");

  // The wizard's step list is dynamic — steps for sections that don't apply
  // to the currently selected category are skipped entirely, not just
  // hidden. "basic" (name + category) always exists.
  const wizardSteps: Array<"basic" | "departments" | "assignable"> = [
    "basic",
    ...(newHasDeptScopedPerms ? (["departments"] as const) : []),
    ...(newHasUserManagePerm ? (["assignable"] as const) : []),
  ];
  // Guard against a stale index if the step list shrank (e.g. category
  // changed to one with fewer applicable sections) after landing on a step.
  const currentStepIndex = Math.min(wizardStep, wizardSteps.length - 1);
  const currentStepKey = wizardSteps[currentStepIndex];
  const isLastStep = currentStepIndex === wizardSteps.length - 1;

  function resetWizard() {
    setWizardStep(0);
    setNewName("");
    setNewCategoryId("");
    setNewAllDepartments(false);
    setNewDepartmentIds([]);
    setNewAssignableCategoryIds([]);
    setNewNotifyOnAssign(false);
    setNewNotifyOnReview(false);
    setNewNotifyOnReschedule(false);
    setNewNotifyOnDone(false);
    setError(null);
  }

  function openWizard() {
    resetWizard();
    setShowNew(true);
  }

  function closeWizard() {
    setShowNew(false);
    resetWizard();
  }

  function goNext() {
    setError(null);
    if (currentStepKey === "basic" && !newName.trim()) {
      setError("Enter a role name to continue.");
      return;
    }
    if (
      currentStepKey === "departments" &&
      !newAllDepartments &&
      newDepartmentIds.length === 0
    ) {
      setError("Select at least one department, or use Select All.");
      return;
    }
    if (isLastStep) {
      handleCreateRole();
      return;
    }
    setWizardStep((s) => Math.min(s + 1, wizardSteps.length - 1));
  }

  function goBack() {
    setError(null);
    setWizardStep((s) => Math.max(s - 1, 0));
  }

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

  // Debounced department save — only fires SAVE_DEBOUNCE_MS after the last
  // click, and always uses whatever is in the draft AT THAT MOMENT (read via
  // the functional form / ref pattern), never a value captured earlier.
  const scheduleDeptSave = useCallback((roleId: number, draft: { allDepartments: boolean; departmentIds: number[] }) => {
    if (deptSaveTimer.current) clearTimeout(deptSaveTimer.current);
    // Don't save an invalid intermediate state (switched off "all" but
    // hasn't picked anything yet) — just let the draft sit until valid.
    if (!draft.allDepartments && draft.departmentIds.length === 0) {
      return;
    }
    deptSaveTimer.current = setTimeout(async () => {
      try {
        setError(null);
        const updatedRole = await setRoleDepartments(roleId, draft.allDepartments, draft.departmentIds);
        setRoles((prev) => prev.map((r) => (r.id === roleId ? updatedRole : r)));
      } catch (err: any) {
        setError(err?.message || "Failed to update department scope.");
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const scheduleAssignableSave = useCallback((roleId: number, ids: number[]) => {
    if (assignableSaveTimer.current) clearTimeout(assignableSaveTimer.current);
    assignableSaveTimer.current = setTimeout(async () => {
      try {
        setError(null);
        const updatedRole = await setRoleAssignableCategories(roleId, ids);
        setRoles((prev) => prev.map((r) => (r.id === roleId ? updatedRole : r)));
      } catch (err: any) {
        setError(err?.message || "Failed to update assignable categories.");
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const scheduleNotificationSave = useCallback((
    roleId: number,
    draft: {
      notifyOnAssign: boolean;
      notifyOnReview: boolean;
      notifyOnReschedule: boolean;
      notifyOnDone: boolean;
    }
  ) => {
    if (notificationSaveTimer.current) clearTimeout(notificationSaveTimer.current);
    notificationSaveTimer.current = setTimeout(async () => {
      try {
        setError(null);
        const updatedRole = await setRoleNotifications(
          roleId,
          draft.notifyOnAssign,
          draft.notifyOnReview,
          draft.notifyOnReschedule,
          draft.notifyOnDone
        );
        setRoles((prev) => prev.map((r) => (r.id === roleId ? updatedRole : r)));
      } catch (err: any) {
        setError(err?.message || "Failed to update notification preferences.");
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  function handleDeptToggleAll(selectAll: boolean) {
    if (!selected) return;
    const next = {
      allDepartments: selectAll,
      departmentIds: selectAll ? departments.map((d) => d.id) : [],
    };
    setDeptDraft(next);
    scheduleDeptSave(selected.id, next);
  }

  function handleDeptToggleOne(deptId: number) {
    if (!selected) return;
    setDeptDraft((prev) => {
      const currentlyOn = prev.allDepartments || prev.departmentIds.includes(deptId);
      // If "all" was on, treat every department as individually checked
      // right now, then apply this one toggle on top of that full set.
      const baseline = prev.allDepartments ? departments.map((d) => d.id) : prev.departmentIds;
      const nextIds = currentlyOn
        ? baseline.filter((id) => id !== deptId)
        : [...baseline, deptId];
      const next = {
        allDepartments: nextIds.length === departments.length && departments.length > 0,
        departmentIds: nextIds,
      };
      scheduleDeptSave(selected.id, next);
      return next;
    });
  }

  function handleAssignableToggleAll(selectAll: boolean) {
    if (!selected) return;
    const next = selectAll ? categories.map((c) => c.id) : [];
    setAssignableDraft(next);
    scheduleAssignableSave(selected.id, next);
  }

  function handleAssignableToggleOne(categoryId: number) {
    if (!selected) return;
    setAssignableDraft((prev) => {
      const next = prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId];
      scheduleAssignableSave(selected.id, next);
      return next;
    });
  }

  function handleNotificationToggle(field: keyof typeof notificationDraft) {
    if (!selected) return;
    setNotificationDraft((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      scheduleNotificationSave(selected.id, next);
      return next;
    });
  }

  async function handleCreateRole() {
    if (!newName.trim()) return;
    try {
      setError(null);
      const categoryId = newCategoryId === "" ? null : Number(newCategoryId);
      const selectedCat = categories.find((c) => c.id === categoryId);
      const hasDept = selectedCat?.permissions.some((p) => DEPARTMENT_SCOPED_PERMISSIONS.has(p));
      const hasUM = selectedCat?.permissions.includes("user:manage");

      if (hasDept && !newAllDepartments && newDepartmentIds.length === 0) {
        setError("Select at least one department, or use Select All.");
        return;
      }

      const nr = await createRole(
        newName.trim(),
        categoryId,
        hasDept ? newAllDepartments : false,
        hasDept ? newDepartmentIds : [],
        hasUM ? newAssignableCategoryIds : [],
        newNotifyOnAssign,
        newNotifyOnReview,
        newNotifyOnReschedule,
        newNotifyOnDone
      );
      setRoles((prev) => [...prev, nr]);
      setSelectedId(nr.id);
      closeWizard();
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

      {error && !showNew && (
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
              onClick={openWizard}
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
                    <SelectAllChecklist
                      items={departments}
                      selectedIds={deptDraft.allDepartments ? departments.map((d) => d.id) : deptDraft.departmentIds}
                      onToggleAll={handleDeptToggleAll}
                      onToggleOne={handleDeptToggleOne}
                    />
                  </div>
                )}

                {/* Can Assign section - only show if category has user:manage permission */}
                {hasUserManagePerm && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Can Assign (when creating/editing users)</h4>
                    <SelectAllChecklist
                      items={categories}
                      selectedIds={assignableDraft}
                      onToggleAll={handleAssignableToggleAll}
                      onToggleOne={handleAssignableToggleOne}
                    />
                  </div>
                )}

                {/* Notification preferences section */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Email Notification Preferences</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                        notificationDraft.notifyOnAssign
                          ? "border-blue-200 bg-blue-50"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationDraft.notifyOnAssign}
                        onChange={() => handleNotificationToggle("notifyOnAssign")}
                        className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                      />
                      <p
                        className={`text-sm font-medium ${
                          notificationDraft.notifyOnAssign ? "text-blue-700" : "text-foreground"
                        }`}
                      >
                        Email when task is assigned
                      </p>
                    </label>
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                        notificationDraft.notifyOnReview
                          ? "border-blue-200 bg-blue-50"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationDraft.notifyOnReview}
                        onChange={() => handleNotificationToggle("notifyOnReview")}
                        className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                      />
                      <p
                        className={`text-sm font-medium ${
                          notificationDraft.notifyOnReview ? "text-blue-700" : "text-foreground"
                        }`}
                      >
                        Email when task is submitted for review
                      </p>
                    </label>
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                        notificationDraft.notifyOnReschedule
                          ? "border-blue-200 bg-blue-50"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationDraft.notifyOnReschedule}
                        onChange={() => handleNotificationToggle("notifyOnReschedule")}
                        className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                      />
                      <p
                        className={`text-sm font-medium ${
                          notificationDraft.notifyOnReschedule ? "text-blue-700" : "text-foreground"
                        }`}
                      >
                        Email when task is rescheduled
                      </p>
                    </label>
                    <label
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                        notificationDraft.notifyOnDone
                          ? "border-blue-200 bg-blue-50"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationDraft.notifyOnDone}
                        onChange={() => handleNotificationToggle("notifyOnDone")}
                        className="w-4 h-4 rounded accent-blue-600 flex-shrink-0 cursor-pointer"
                      />
                      <p
                        className={`text-sm font-medium ${
                          notificationDraft.notifyOnDone ? "text-blue-700" : "text-foreground"
                        }`}
                      >
                        Email when task is approved
                      </p>
                    </label>
                  </div>
                </div>
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
        <Dlg title="Create role" onClose={closeWizard}>
          <WizardProgress total={wizardSteps.length} current={currentStepIndex} />

          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs">
              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <span className="text-red-700">{error}</span>
            </div>
          )}

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Step {currentStepIndex + 1} of {wizardSteps.length}
          </p>

          {currentStepKey === "basic" && (
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
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  The new role will inherit permissions from its category.
                </p>
              </div>
            </div>
          )}

          {currentStepKey === "departments" && (
            <SelectAllChecklist
              items={departments}
              selectedIds={newAllDepartments ? departments.map((d) => d.id) : newDepartmentIds}
              onToggleAll={(selectAll) => {
                setNewAllDepartments(selectAll);
                setNewDepartmentIds(selectAll ? departments.map((d) => d.id) : []);
              }}
              onToggleOne={(deptId) => {
                const baseline = newAllDepartments ? departments.map((d) => d.id) : newDepartmentIds;
                const currentlyOn = baseline.includes(deptId);
                const nextIds = currentlyOn ? baseline.filter((id) => id !== deptId) : [...baseline, deptId];
                setNewDepartmentIds(nextIds);
                setNewAllDepartments(nextIds.length === departments.length && departments.length > 0);
              }}
            />
          )}

          {currentStepKey === "assignable" && (
            <SelectAllChecklist
              items={categories}
              selectedIds={newAssignableCategoryIds}
              onToggleAll={(selectAll) => setNewAssignableCategoryIds(selectAll ? categories.map((c) => c.id) : [])}
              onToggleOne={(catId) => {
                setNewAssignableCategoryIds((prev) =>
                  prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
                );
              }}
            />
          )}

          <div className="flex justify-between gap-2 pt-5 mt-5 border-t border-border">
            {currentStepIndex > 0 ? (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                <ArrowLeft size={14} /> Back
              </button>
            ) : (
              <button
                onClick={closeWizard}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
            )}
            <button
              onClick={goNext}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              {isLastStep ? "Create role" : "Next"}
              {!isLastStep && <ArrowRight size={14} />}
            </button>
          </div>
        </Dlg>
      )}
    </div>
  );
}