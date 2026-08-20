import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Edit2, AlertTriangle, Shield, Users, Settings, Calendar, CheckCircle2 } from "lucide-react";
import { Role, PermDef, Department, UserType } from "../types";
import { getRole, getRoleActivity, getAllPermissions, updateRole, getRoles } from "../api/roles";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

const COLOR_SWATCHES = [
  { name: "purple", value: "#a855f7", bg: "bg-purple-100", text: "text-purple-600" },
  { name: "blue", value: "#3b82f6", bg: "bg-blue-100", text: "text-blue-600" },
  { name: "green", value: "#10b981", bg: "bg-emerald-100", text: "text-emerald-600" },
  { name: "orange", value: "#f97316", bg: "bg-orange-100", text: "text-orange-600" },
  { name: "red", value: "#ef4444", bg: "bg-red-100", text: "text-red-600" },
];

function getColorClasses(color: string) {
  const swatch = COLOR_SWATCHES.find((s) => s.name === color) || COLOR_SWATCHES[1];
  return { bg: swatch.bg, text: swatch.text };
}

function getInitials(name: string) {
  if (!name) return "";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Tab = "overview" | "permissions" | "users" | "activity";

export function RoleDetailPage() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [activity, setActivity] = useState<{
    actorId: number;
    action: string;
    detail: string | null;
    createdAt: string;
  }[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermDef[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [localPermissionIds, setLocalPermissionIds] = useState<number[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>("");
  const [localDepartmentIds, setLocalDepartmentIds] = useState<number[]>([]);
  const [localAssignableRoleIds, setLocalAssignableRoleIds] = useState<number[]>([]);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("blue");
  const [editError, setEditError] = useState<string | null>(null);

  // Filter out the current role from the list for assignable roles
  const otherRoles = useMemo(() => {
    return allRoles.filter((r) => r.id !== role?.id);
  }, [allRoles, role]);

  useEffect(() => {
    async function loadData() {
      if (!roleId) return;
      try {
        setLoading(true);
        setError(null);
        const [roleData, activityData, permissionsData, departmentsData, rolesData, usersData] = await Promise.all([
          getRole(Number(roleId)),
          getRoleActivity(Number(roleId)),
          getAllPermissions(),
          getDepartments(),
          getRoles(),
          getUsers(),
        ]);
        setRole(roleData);
        setActivity(activityData);
        setAllPermissions(permissionsData);
        setAllDepartments(departmentsData);
        setAllRoles(rolesData);
        setAllUsers(usersData);
      } catch (err: any) {
        setError(err?.message || "Failed to load role details.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [roleId]);

  // Sync local state when switching to permissions tab or when role changes
  useEffect(() => {
    if (activeTab === "permissions" && role) {
      setLocalPermissionIds(role.permissions.map((p) => {
        const perm = allPermissions.find((ap) => ap.name === p);
        return perm?.id || 0;
      }).filter((id) => id !== 0));
      setLocalDepartmentIds(
        role.allDepartments ? allDepartments.map((d) => d.id) : role.departments.map((d) => d.id)
      );
      setLocalAssignableRoleIds(
        role.allRoles ? otherRoles.map((r) => r.id) : role.assignableRoles.map((r) => r.id)
      );
    }
  }, [activeTab, role, allPermissions, allDepartments, otherRoles]);

  // Group permissions by module (part before colon)
  const permissionModules = useMemo(() => {
    const modules: Record<string, PermDef[]> = {};
    allPermissions.forEach((perm) => {
      const [module] = perm.name.split(":");
      if (!modules[module]) modules[module] = [];
      modules[module].push(perm);
    });
    return modules;
  }, [allPermissions]);

  const moduleNames = Object.keys(permissionModules).sort();

  // Select first module by default
  useEffect(() => {
    if (moduleNames.length > 0 && !selectedModule) {
      setSelectedModule(moduleNames[0]);
    }
  }, [moduleNames, selectedModule]);

  const currentModulePermissions = permissionModules[selectedModule] || [];

  // Check if local state differs from original role
  const hasUnsavedChanges = useMemo(() => {
    if (!role) return false;

    // Check permissions
    const originalPermissionIds = role.permissions.map((p) => {
      const perm = allPermissions.find((ap) => ap.name === p);
      return perm?.id || 0;
    }).filter((id) => id !== 0);
    const sortedOriginalPermissions = [...originalPermissionIds].sort((a, b) => a - b);
    const sortedLocalPermissions = [...localPermissionIds].sort((a, b) => a - b);
    if (sortedOriginalPermissions.length !== sortedLocalPermissions.length) return true;
    if (sortedOriginalPermissions.some((id, i) => id !== sortedLocalPermissions[i])) return true;

    // Check departments
    const computedAllDepartments = localDepartmentIds.length === allDepartments.length;
    if (role.allDepartments !== computedAllDepartments) return true;
    const originalDepartmentIds = role.departments.map((d) => d.id).sort((a, b) => a - b);
    const sortedLocalDepartments = [...localDepartmentIds].sort((a, b) => a - b);
    if (originalDepartmentIds.length !== sortedLocalDepartments.length) return true;
    if (originalDepartmentIds.some((id, i) => id !== sortedLocalDepartments[i])) return true;

    // Check assignable roles
    const computedAllRoles = localAssignableRoleIds.length === otherRoles.length;
    if (role.allRoles !== computedAllRoles) return true;
    const originalAssignableIds = role.assignableRoles.map((r) => r.id).sort((a, b) => a - b);
    const sortedLocalAssignable = [...localAssignableRoleIds].sort((a, b) => a - b);
    if (originalAssignableIds.length !== sortedLocalAssignable.length) return true;
    if (originalAssignableIds.some((id, i) => id !== sortedLocalAssignable[i])) return true;

    return false;
  }, [role, allPermissions, localPermissionIds, localDepartmentIds, allDepartments, localAssignableRoleIds, allRoles]);

  async function handleSavePermissions() {
    if (!role) return;
    try {
      setError(null);
      const computedAllDepartments = localDepartmentIds.length === allDepartments.length;
      const computedAllRoles = localAssignableRoleIds.length === otherRoles.length;
      await updateRole(role.id, {
        permissionIds: localPermissionIds,
        allDepartments: computedAllDepartments,
        departmentIds: computedAllDepartments ? [] : localDepartmentIds,
        allRoles: computedAllRoles,
        assignableRoleIds: computedAllRoles ? [] : localAssignableRoleIds,
      });
      const updatedRole = await getRole(role.id);
      setRole(updatedRole);
      setSuccessMessage("Permissions updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to update permissions.");
    }
  }

  function openEditDialog() {
    if (!role) return;
    setEditName(role.name);
    setEditDescription(role.description || "");
    setEditColor(role.color);
    setEditError(null);
    setShowEditDialog(true);
  }

  async function handleSaveEdit() {
    if (!role) return;
    if (!editName.trim()) {
      setEditError("Role name is required.");
      return;
    }
    try {
      setError(null);
      setEditError(null);
      await updateRole(role.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        color: editColor,
      });
      const updatedRole = await getRole(role.id);
      setRole(updatedRole);
      setShowEditDialog(false);
      setSuccessMessage("Role updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setEditError(err?.message || "Failed to update role.");
    }
  }

  function togglePermission(permId: number) {
    setLocalPermissionIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  }

  function toggleAllPermissionsInModule() {
    const allSelected = currentModulePermissions.every((p) => localPermissionIds.includes(p.id));
    if (allSelected) {
      setLocalPermissionIds((prev) =>
        prev.filter((id) => !currentModulePermissions.some((p) => p.id === id))
      );
    } else {
      setLocalPermissionIds((prev) => {
        const moduleIds = currentModulePermissions.map((p) => p.id);
        return [...new Set([...prev, ...moduleIds])];
      });
    }
  }

  function toggleAllDepartments() {
    const allSelected = allDepartments.every((d) => localDepartmentIds.includes(d.id));
    if (allSelected) {
      setLocalDepartmentIds([]);
    } else {
      setLocalDepartmentIds(allDepartments.map((d) => d.id));
    }
  }

  function toggleAllAssignableRoles() {
    const allSelected = otherRoles.every((r) => localAssignableRoleIds.includes(r.id));
    if (allSelected) {
      setLocalAssignableRoleIds([]);
    } else {
      setLocalAssignableRoleIds(otherRoles.map((r) => r.id));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading role...</span>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">Role not found</span>
        </div>
      </div>
    );
  }

  const colorClasses = getColorClasses(role.color);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link to="/roles" className="hover:text-foreground transition-colors">
            Roles
          </Link>
          <span>/</span>
          <span className="text-foreground">{role.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg ${colorClasses.bg} ${colorClasses.text} flex items-center justify-center font-semibold text-lg flex-shrink-0`}>
              {getInitials(role.name)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{role.name}</h1>
              {role.isSystem && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 mt-1">
                  <Shield size={10} />
                  System
                </span>
              )}
              {role.isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 mt-1">
                  Inactive
                </span>
              )}
            </div>
          </div>
          <button
            onClick={openEditDialog}
            className="flex items-center gap-2 px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Edit2 size={16} />
            Edit Role
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {[
            { id: "overview", label: "Overview", icon: Settings },
            { id: "permissions", label: "Permissions", icon: Shield },
            { id: "users", label: "Users", icon: Users },
            { id: "activity", label: "Activity", icon: Calendar },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Basic Information</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Description</label>
                <p className="text-sm text-foreground">{role.description || "No description"}</p>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded ${colorClasses.bg}`} />
                  <span className="text-sm text-foreground capitalize">{role.color}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Created By</label>
                <p className="text-sm text-foreground">{role.creator ? role.creator.name : "System"}</p>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Created At</label>
                <p className="text-sm text-foreground">{fmtDateTime(role.createdAt)}</p>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Updated At</label>
                <p className="text-sm text-foreground">{fmtDateTime(role.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="text-muted-foreground" size={20} />
                <span className="text-2xl font-bold text-foreground">{role.userCount}</span>
              </div>
              <p className="text-sm text-muted-foreground">Users</p>
            </div>
            <div className="bg-white rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <Shield className="text-muted-foreground" size={20} />
                <span className="text-2xl font-bold text-foreground">{role.permissions.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Permissions</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <div className="max-w-4xl mx-auto">
          {successMessage && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm mb-4">
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
              <span className="text-emerald-700">{successMessage}</span>
            </div>
          )}
          <div className="bg-white rounded-xl border border-border p-4 space-y-4">
            <div className="flex gap-4">
              {/* Module Sidebar */}
              <div className="w-48 flex-shrink-0">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Modules
                </label>
                <div className="border border-border rounded-lg overflow-hidden">
                  {moduleNames.map((module) => (
                    <button
                      key={module}
                      onClick={() => setSelectedModule(module)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0 transition-colors ${
                        selectedModule === module
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      {module.charAt(0).toUpperCase() + module.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permission Checkboxes */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground">
                    {selectedModule.charAt(0).toUpperCase() + selectedModule.slice(1)} Permissions
                  </label>
                  <button
                    onClick={toggleAllPermissionsInModule}
                    className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Select All
                  </button>
                </div>
                <div className="border border-border rounded-lg p-3 space-y-2 max-h-96 overflow-y-auto">
                  {currentModulePermissions.map((perm) => {
                    const permName = perm.name.split(":")[1];
                    const isChecked = localPermissionIds.includes(perm.id);
                    return (
                      <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(perm.id)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-sm text-foreground">
                          {permName.charAt(0).toUpperCase() + permName.slice(1)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Department Access Section - only show if permissions are selected */}
            {localPermissionIds.length > 0 && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Department Access</h3>
                  <button
                    onClick={toggleAllDepartments}
                    className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    {allDepartments.length > 0 && allDepartments.every((d) => localDepartmentIds.includes(d.id)) ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {allDepartments.length > 0 ? (
                  <div className="border border-border rounded-lg p-3 grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {allDepartments.map((dept) => (
                      <label key={dept.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localDepartmentIds.includes(dept.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setLocalDepartmentIds((prev) => [...prev, dept.id]);
                            } else {
                              setLocalDepartmentIds((prev) => prev.filter((id) => id !== dept.id));
                            }
                          }}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-sm text-foreground">{dept.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No departments exist yet</p>
                )}
              </div>
            )}

            {/* Assignable Roles Section - only show if user:manage permission is selected */}
            {localPermissionIds.length > 0 && allPermissions.find(p => p.name === "user:manage") && localPermissionIds.includes(allPermissions.find(p => p.name === "user:manage")!.id) && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Assignable Roles</h3>
                  <button
                    onClick={toggleAllAssignableRoles}
                    className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    {otherRoles.length > 0 && otherRoles.every((r) => localAssignableRoleIds.includes(r.id)) ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {otherRoles.length > 0 ? (
                  <div className="border border-border rounded-lg p-3 grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {otherRoles.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localAssignableRoleIds.includes(r.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setLocalAssignableRoleIds((prev) => [...prev, r.id]);
                            } else {
                              setLocalAssignableRoleIds((prev) => prev.filter((id) => id !== r.id));
                            }
                          }}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-sm text-foreground">{r.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No other roles exist yet — create another role first</p>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-border">
              <button
                onClick={handleSavePermissions}
                disabled={!hasUnsavedChanges}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                  hasUnsavedChanges
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Name</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Email</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Department</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.filter((u) => u.role?.id === role?.id).map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <td className="px-4 py-3 text-sm text-foreground">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{user.department?.name || "-"}</td>
                </tr>
              ))}
              {allUsers.filter((u) => u.role?.id === role?.id).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No users with this role
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Activity Timeline</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded</p>
          ) : (
            <div className="space-y-4">
              {activity.slice().reverse().map((act, idx) => {
                const actor = allUsers.find((u) => u.id === act.actorId);
                return (
                  <div key={idx} className="flex gap-4 pb-4 border-b border-border last:border-b-0">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {actor ? getInitials(actor.name) : "?"}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">
                          {actor ? actor.name : "Unknown"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {act.action}
                        </span>
                      </div>
                      {act.detail && (
                        <p className="text-sm text-muted-foreground mb-1">{act.detail}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{fmtDateTime(act.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Role Dialog */}
      {showEditDialog && (
        <Dlg title="Edit Role" onClose={() => setShowEditDialog(false)} size="md">
          <div className="space-y-4">
            <FldInput
              label="Role Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description of this role..."
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Color
              </label>
              <div className="flex gap-2">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.name}
                    onClick={() => setEditColor(swatch.name)}
                    className={`w-8 h-8 rounded-lg transition-all ${
                      editColor === swatch.name
                        ? "ring-2 ring-offset-2 ring-blue-500 scale-110"
                        : "hover:ring-2 hover:ring-offset-2 hover:ring-blue-300"
                    } ${swatch.bg}`}
                  />
                ))}
              </div>
            </div>
            {editError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEditDialog(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
