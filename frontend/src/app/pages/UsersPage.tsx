import React, { useState, useEffect } from "react";
import { Edit2, AlertTriangle, Plus, Trash2, Search, Eye, EyeOff, RefreshCw, Upload } from "lucide-react";
import { UserType, Role, Department } from "../types";
import { getUsers, createUser, deleteUser, uploadAvatar } from "../api/users";
import { getRoles } from "../api/roles";
import { getDepartments } from "../api/departments";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router";

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function generatePassword(length: number = 12): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

export function UsersPage() {
  const { permissions, currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserType[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const canManage = permissions.includes("user:manage");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createDepartment, setCreateDepartment] = useState<string>("");
  const [createRole, setCreateRole] = useState<string>("");
  const [createActive, setCreateActive] = useState(true);
  const [createSendWelcome, setCreateSendWelcome] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserType | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedUsers, fetchedRoles, fetchedDepartments] = await Promise.all([
          getUsers(),
          getRoles(),
          getDepartments(),
        ]);
        setUsers(fetchedUsers);
        setRoles(fetchedRoles);
        setDepartments(fetchedDepartments);
      } catch (err: any) {
        setError(err?.message || "Failed to load users data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter roles based on assignable roles
  const assignableRoleIds = (currentUser?.role?.assignableRoles ?? []).map((r) => r.id);
  const assignableRoles = roles.filter((role) => assignableRoleIds.includes(role.id));

  // Filter users based on search and filters
  const filteredUsers = users.filter((user) => {
    const matchesSearch = 
      searchQuery === "" || 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDepartment = 
      filterDepartment === "all" || 
      user.department?.id === Number(filterDepartment);
    
    const matchesRole = 
      filterRole === "all" || 
      user.role?.id === Number(filterRole);
    
    const matchesStatus = 
      filterStatus === "all" || 
      (filterStatus === "active" && user.active) ||
      (filterStatus === "inactive" && !user.active);
    
    return matchesSearch && matchesDepartment && matchesRole && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage
  );

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.active).length;
  const inactiveUsers = users.filter((u) => !u.active).length;
  const noDepartment = users.filter((u) => !u.department).length;

  async function handleCreateUser() {
    if (!createName.trim() || !createEmail.trim() || !createPassword) {
      setCreateError("All fields are required.");
      return;
    }
    if (createPassword.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }
    try {
      setCreateError(null);
      setError(null);
      const roleId = createRole ? Number(createRole) : undefined;
      const deptId = createDepartment ? Number(createDepartment) : undefined;
      const newUser = await createUser({
        name: createName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        role_id: roleId,
        department_id: deptId,
        isActive: createActive,
        sendWelcomeEmail: createSendWelcome,
      });
      
      // Upload avatar as follow-up if a file was selected
      if (createAvatarFile) {
        try {
          await uploadAvatar(newUser.id, createAvatarFile);
          // Refresh user data to get has_avatar updated
          const updatedUsers = await getUsers();
          setUsers(updatedUsers);
        } catch (err: any) {
          console.error("Avatar upload failed:", err);
          setAvatarUploadError("User created, but avatar upload failed");
        }
      }
      
      setUsers((prev) => [...prev, newUser]);
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create user.");
    }
  }

  function resetCreateForm() {
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    setShowPassword(false);
    setCreateDepartment("");
    setCreateRole("");
    setCreateActive(true);
    setCreateSendWelcome(true);
    setCreateError(null);
    setCreateAvatarFile(null);
    setAvatarUploadError(null);
  }

  async function handleDelete(user: UserType) {
    try {
      setError(null);
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setDeleteConfirmUser(null);
    } catch (err: any) {
      setError(err?.message || "Failed to delete user.");
    }
  }

  function toggleUserSelection(userId: number) {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === paginatedUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(paginatedUsers.map((u) => u.id)));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading users...</span>
      </div>
    );
  }

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
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Manage system users and their access</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Users</span>
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-sm font-semibold">{totalUsers}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Users</span>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <span className="text-emerald-600 text-sm font-semibold">{activeUsers}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{activeUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactive Users</span>
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
              <span className="text-gray-600 text-sm font-semibold">{inactiveUsers}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{inactiveUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">No Department</span>
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <span className="text-amber-600 text-sm font-semibold">{noDepartment}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{noDepartment}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-foreground"
            />
          </div>
          <FldSelect
            label="Department"
            options={[
              { value: "all", label: "All Departments" },
              ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
            ]}
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          />
          <FldSelect
            label="Role"
            options={[
              { value: "all", label: "All Roles" },
              ...roles.map((r) => ({ value: r.id.toString(), label: r.name })),
            ]}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          />
          <FldSelect
            label="Status"
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
          {canManage && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer self-end"
            >
              <Plus size={16} />
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.size === paginatedUsers.length && paginatedUsers.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-blue-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined On</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr 
                  key={user.id} 
                  className="border-b border-border hover:bg-muted/20 cursor-pointer"
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleUserSelection(user.id);
                      }}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.hasAvatar ? (
                        <img
                          src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/users/${user.id}/avatar`}
                          alt={user.name}
                          className="w-8 h-8 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <Av name={user.name} className={user.hasAvatar ? 'hidden' : ''} />
                      <span className="text-sm font-medium text-foreground">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.role ? (
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${user.role.color}20`,
                          color: user.role.color,
                        }}
                      >
                        {user.role.name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.department?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    {user.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/users/${user.id}`);
                        }}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 size={14} className="text-muted-foreground" />
                      </button>
                      {canManage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmUser(user);
                          }}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredUsers.length > usersPerPage && (
          <div className="px-4 py-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
            </span>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    currentPage === i + 1
                      ? "bg-blue-500 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      {showCreateDialog && (
        <Dlg
          isOpen={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            resetCreateForm();
          }}
          title="Create New User"
          size="md"
        >
          <div className="space-y-4">
            {createError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-red-700">{createError}</span>
              </div>
            )}

            <FldInput
              label="Full Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />

            <FldInput
              label="Email Address"
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-foreground pr-8"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatePassword(generatePassword(12))}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} />
                  Generate
                </button>
              </div>
              {createPassword && createPassword.length < 8 && (
                <p className="text-xs text-red-600 mt-1">Password must be at least 8 characters</p>
              )}
            </div>

            <FldSelect
              label="Department"
              options={[
                { value: "", label: "Select department" },
                ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
              ]}
              value={createDepartment}
              onChange={(e) => setCreateDepartment(e.target.value)}
              required
            />

            <FldSelect
              label="Role"
              options={[
                { value: "", label: "Select role" },
                ...assignableRoles.map((r) => ({ value: r.id.toString(), label: r.name })),
              ]}
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value)}
              required
            />

            {/* Avatar Upload */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Profile Picture
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) {
                        setAvatarUploadError("Image must be under 2MB");
                        return;
                      }
                      setCreateAvatarFile(file);
                      setAvatarUploadError(null);
                    }
                  }}
                  className="hidden"
                  id="avatar-upload"
                />
                <label htmlFor="avatar-upload" className="cursor-pointer">
                  {createAvatarFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <Upload size={16} className="text-blue-500" />
                      <span className="text-sm text-foreground">{createAvatarFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={20} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload photo, JPG/PNG up to 2MB</span>
                    </div>
                  )}
                </label>
              </div>
              {avatarUploadError && (
                <p className="text-xs text-red-600 mt-1">{avatarUploadError}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Account Status
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="active"
                    checked={createActive}
                    onChange={() => setCreateActive(true)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="inactive"
                    checked={!createActive}
                    onChange={() => setCreateActive(false)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-foreground">Inactive</span>
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createSendWelcome}
                onChange={(e) => setCreateSendWelcome(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-foreground">Send welcome email with login details</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  resetCreateForm();
                }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Create User
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmUser && (
        <Dlg
          isOpen={!!deleteConfirmUser}
          onClose={() => setDeleteConfirmUser(null)}
          title="Delete User"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete <strong>{deleteConfirmUser.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmUser)}
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
