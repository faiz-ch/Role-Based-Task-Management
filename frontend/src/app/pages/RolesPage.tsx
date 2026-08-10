import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, AlertTriangle, Trash2, Search, CheckCircle2, Settings, Users as UsersIcon, Shield } from "lucide-react";
import { Role, Department, Category, PermDef } from "../types";
import { getRoles, createRole, updateRole, deleteRole, getAllPermissions } from "../api/roles";
import { getDepartments } from "../api/departments";
import { getCategories } from "../api/categories";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";

export function RolesPage() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  
  // Step 1 form state
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("blue");
  const [newAssignableRoleIds, setNewAssignableRoleIds] = useState<number[]>([]);
  const [newAllDepartments, setNewAllDepartments] = useState(false);
  const [newDepartmentIds, setNewDepartmentIds] = useState<number[]>([]);
  const [departmentSearchQuery, setDepartmentSearchQuery] = useState("");
  
  // Step 2 form state
  const [newPermissionIds, setNewPermissionIds] = useState<number[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | "">("");
  const [selectedModule, setSelectedModule] = useState<string>("");

  const [deleteConfirmRole, setDeleteConfirmRole] = useState<Role | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedRoles, fetchedDepartments, fetchedCategories, fetchedPermissions] = await Promise.all([
          getRoles(),
          getDepartments(),
          getCategories(),
          getAllPermissions(),
        ]);
        setRoles(fetchedRoles);
        setDepartments(fetchedDepartments);
        setCategories(fetchedCategories);
        setAllPermissions(fetchedPermissions);
      } catch (err: any) {
        setError(err?.message || "Failed to load roles data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Group permissions by module (part before colon)
  const permissionModules = React.useMemo(() => {
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

  // Handle preset selection
  useEffect(() => {
    if (selectedPresetId === "") {
      setNewPermissionIds([]);
      return;
    }
    const preset = categories.find((c) => c.id === Number(selectedPresetId));
    if (preset) {
      const presetPermIds = allPermissions
        .filter((p) => preset.permissions.includes(p.name))
        .map((p) => p.id);
      setNewPermissionIds(presetPermIds);
    }
  }, [selectedPresetId, categories, allPermissions]);

  // Filter roles by search
  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const totalRoles = roles.length;
  const systemRoles = roles.filter((r) => r.isSystem).length;
  const customRoles = roles.filter((r) => !r.isSystem).length;
  const totalPermissions = allPermissions.length;

  async function handleCreateRole() {
    if (!newRoleName.trim()) {
      setError("Role name is required.");
      return;
    }
    try {
      setError(null);
      
      const newRole = await createRole({
        name: newRoleName.trim(),
        description: newRoleDescription.trim() || undefined,
        color: newRoleColor,
        isActive: true,
        isSystem: false,
        allDepartments: newAllDepartments,
        departmentIds: newAllDepartments ? [] : newDepartmentIds,
        permissionIds: newPermissionIds,
      });

      // Update assignable roles for selected roles (best-effort)
      if (newAssignableRoleIds.length > 0) {
        for (const roleId of newAssignableRoleIds) {
          try {
            const existingRole = roles.find((r) => r.id === roleId);
            if (existingRole) {
              const updatedAssignableIds = [...existingRole.assignableRoles.map((r) => r.id), newRole.id];
              await updateRole(roleId, { assignableRoleIds: updatedAssignableIds });
            }
          } catch (err) {
            console.error(`Failed to update assignable roles for role ${roleId}:`, err);
          }
        }
      }

      setRoles((prev) => [...prev, newRole]);
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (err: any) {
      setError(err?.message || "Failed to create role.");
    }
  }

  async function handleDeleteRole(role: Role) {
    try {
      setError(null);
      await deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      setDeleteConfirmRole(null);
    } catch (err: any) {
      setError(err?.message || "Failed to delete role.");
    }
  }

  function resetCreateForm() {
    setCreateStep(1);
    setNewRoleName("");
    setNewRoleDescription("");
    setNewRoleColor("blue");
    setNewAssignableRoleIds([]);
    setNewAllDepartments(false);
    setNewDepartmentIds([]);
    setDepartmentSearchQuery("");
    setNewPermissionIds([]);
    setSelectedPresetId("");
    setSelectedModule(moduleNames[0] || "");
    setError(null);
  }

  function closeCreateDialog() {
    setShowCreateDialog(false);
    resetCreateForm();
  }

  function togglePermission(permId: number) {
    setNewPermissionIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  }

  function toggleAllPermissionsInModule() {
    const allSelected = currentModulePermissions.every((p) => newPermissionIds.includes(p.id));
    if (allSelected) {
      setNewPermissionIds((prev) =>
        prev.filter((id) => !currentModulePermissions.some((p) => p.id === id))
      );
    } else {
      setNewPermissionIds((prev) => {
        const moduleIds = currentModulePermissions.map((p) => p.id);
        return [...new Set([...prev, ...moduleIds])];
      });
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
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Roles</h1>
        <p className="text-sm text-muted-foreground">Manage roles and their permissions</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Roles</p>
              <p className="text-2xl font-bold text-foreground">{totalRoles}</p>
            </div>
            <Shield className="text-blue-500" size={24} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">System Roles</p>
              <p className="text-2xl font-bold text-foreground">{systemRoles}</p>
            </div>
            <Settings className="text-purple-500" size={24} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Custom Roles</p>
              <p className="text-2xl font-bold text-foreground">{customRoles}</p>
            </div>
            <UsersIcon className="text-green-500" size={24} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Permissions</p>
              <p className="text-2xl font-bold text-foreground">{totalPermissions}</p>
            </div>
            <CheckCircle2 className="text-orange-500" size={24} />
          </div>
        </div>
      </div>

      {/* Search and Create */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search roles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Create Role
        </button>
      </div>

      {/* Roles Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Role Name</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Description</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Users</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Permissions</th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.map((role) => (
              <tr
                key={role.id}
                className="border-b border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => navigate(`/roles/${role.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{role.name}</span>
                    {role.isSystem && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                        System
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                  {role.description || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">{role.userCount}</td>
                <td className="px-4 py-3 text-sm text-foreground">{role.permissions.length}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmRole(role);
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredRoles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No roles found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Role Dialog */}
      {showCreateDialog && (
        <Dlg
          isOpen={showCreateDialog}
          onClose={closeCreateDialog}
          title={createStep === 1 ? "Create Role - Step 1 of 2" : "Create Role - Step 2 of 2"}
          size="xl"
        >
          <div className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-red-700">{error}</span>
              </div>
            )}

            {createStep === 1 ? (
              <div className="space-y-6">
                {/* Basic Info Card */}
                <div className="bg-muted/30 rounded-xl p-6 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Basic Information</h3>
                  
                  {/* Role Name */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Role Name <span className="text-red-500">*</span>
                    </label>
                    <FldInput
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="e.g., Team Lead"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Description
                    </label>
                    <textarea
                      value={newRoleDescription}
                      onChange={(e) => setNewRoleDescription(e.target.value)}
                      placeholder="Optional description of this role..."
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>

                {/* Department Access Card */}
                <div className="bg-muted/30 rounded-xl p-6 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Department Access</h3>
                  
                  <label className="flex items-center gap-2 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={newAllDepartments}
                      onChange={(e) => setNewAllDepartments(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm text-foreground">All Departments</span>
                  </label>
                  
                  {!newAllDepartments && (
                    <>
                      {departments.length > 6 && (
                        <div className="mb-3">
                          <input
                            type="text"
                            placeholder="Search departments..."
                            value={departmentSearchQuery}
                            onChange={(e) => setDepartmentSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                        {departments
                          .filter((dept) => 
                            dept.name.toLowerCase().includes(departmentSearchQuery.toLowerCase())
                          )
                          .map((dept) => (
                            <label key={dept.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newDepartmentIds.includes(dept.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewDepartmentIds((prev) => [...prev, dept.id]);
                                  } else {
                                    setNewDepartmentIds((prev) => prev.filter((id) => id !== dept.id));
                                  }
                                }}
                                className="w-4 h-4 accent-blue-600"
                              />
                              <span className="text-sm text-foreground">{dept.name}</span>
                            </label>
                          ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Assignable By Card */}
                <div className="bg-muted/30 rounded-xl p-6 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-4">
                    Assignable By (roles that can assign this role)
                  </h3>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                    {roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newAssignableRoleIds.includes(role.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewAssignableRoleIds((prev) => [...prev, role.id]);
                            } else {
                              setNewAssignableRoleIds((prev) => prev.filter((id) => id !== role.id));
                            }
                          }}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-sm text-foreground">{role.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setCreateStep(2)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    Continue to Permissions
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Preset Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Start from a preset (optional)
                  </label>
                  <select
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No preset</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Permission Picker */}
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
                    <div className="border border-border rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                      {currentModulePermissions.map((perm) => {
                        const permName = perm.name.split(":")[1];
                        const isChecked = newPermissionIds.includes(perm.id);
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

                <div className="flex justify-between">
                  <button
                    onClick={() => setCreateStep(1)}
                    className="px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateRole}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    Create Role
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dlg>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmRole && (
        <Dlg
          isOpen={!!deleteConfirmRole}
          onClose={() => setDeleteConfirmRole(null)}
          title="Delete Role"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete the role "{deleteConfirmRole.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmRole(null)}
                className="px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRole(deleteConfirmRole)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
