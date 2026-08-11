import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Edit2, Trash2, MoreVertical, AlertTriangle, User, Briefcase, BarChart3, Clock, CheckCircle2, XCircle, Activity, Upload } from "lucide-react";
import { UserType, Role, Department, UserPerformance } from "../types";
import { getUser, getUserPerformance, getUserActivity, updateUser, deleteUser, assignRole, uploadAvatar, deleteAvatar, getAvatarUrl } from "../api/users";
import { getDepartments } from "../api/departments";
import { getRoles } from "../api/roles";
import { getUsers } from "../api/users";
import { Dlg } from "../components/Dlg";
import { FldSelect } from "../components/FldSelect";
import { FldInput } from "../components/FldInput";
import { Av } from "../components/Av";
import { useAuth } from "../context/AuthContext";

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

type Tab = "overview" | "permissions" | "projects" | "activity";

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [user, setUser] = useState<UserType | null>(null);
  const [performance, setPerformance] = useState<UserPerformance | null>(null);
  const [activity, setActivity] = useState<{
    actorId: number;
    action: string;
    detail: string | null;
    createdAt: string;
  }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    departmentId: "" as string,
    roleId: "" as string,
    managerId: "" as string,
    active: true,
    password: "",
  });
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!userId) return;
      try {
        setLoading(true);
        setError(null);
        const [userData, perfData, activityData, deptsData, rolesData, usersData] = await Promise.all([
          getUser(Number(userId)),
          getUserPerformance(Number(userId)),
          getUserActivity(Number(userId)),
          getDepartments(),
          getRoles(),
          getUsers(),
        ]);
        setUser(userData);
        setPerformance(perfData);
        setActivity(activityData);
        setDepartments(deptsData);
        setRoles(rolesData);
        setAllUsers(usersData);
        setEditForm({
          name: userData.name,
          email: userData.email,
          departmentId: userData.department?.id?.toString() || "",
          roleId: userData.role?.id?.toString() || "",
          managerId: userData.manager?.id?.toString() || "",
          active: userData.active,
        });
      } catch (err: any) {
        setError(err?.message || "Failed to load user details.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userId]);

  // Filter roles based on assignable roles (same logic as UsersPage)
  const assignableRoleIds = (currentUser?.role?.assignableRoles ?? []).map((r) => r.id);
  const assignableRoles = roles.filter((role) => assignableRoleIds.includes(role.id));

  // Filter out current user from manager options
  const managerOptions = allUsers.filter((u) => u.id !== Number(userId));

  async function handleSaveEdit() {
    if (!user) return;
    try {
      setError(null);
      const updateData: any = {};
      if (editForm.name !== user.name) updateData.name = editForm.name;
      if (editForm.email !== user.email) updateData.email = editForm.email;
      if (editForm.departmentId !== (user.department?.id?.toString() || "")) {
        updateData.department_id = editForm.departmentId ? Number(editForm.departmentId) : null;
      }
      if (editForm.managerId !== (user.manager?.id?.toString() || "")) {
        updateData.manager_id = editForm.managerId ? Number(editForm.managerId) : null;
      }
      if (editForm.active !== user.active) updateData.active = editForm.active;
      if (editForm.password && editForm.password.length > 0) {
        updateData.password = editForm.password;
      }

      const roleChanged = editForm.roleId !== (user.role?.id?.toString() || "");
      const newRoleId = editForm.roleId ? Number(editForm.roleId) : null;

      let updated = await updateUser(user.id, updateData);
      if (roleChanged) {
        updated = await assignRole(user.id, newRoleId);
      }

      // Upload avatar if a file was selected
      if (editAvatarFile) {
        try {
          updated = await uploadAvatar(user.id, editAvatarFile);
          setEditAvatarFile(null);
        } catch (err: any) {
          setError(err?.message || "Avatar upload failed — other changes were saved.");
          setUser(updated);
          return; // keep dialog open so the person can see the error and retry
        }
      }

      setUser(updated);
      setShowEdit(false);
      setEditForm({ ...editForm, password: "" });
    } catch (err: any) {
      setError(err?.message || "Failed to update user.");
    }
  }

  async function handleRemoveAvatar() {
    if (!user) return;
    try {
      const updated = await deleteAvatar(user.id);
      setUser(updated);
      setEditAvatarFile(null);
    } catch (err: any) {
      setError(err?.message || "Failed to remove picture.");
    }
  }

  async function handleDelete() {
    if (!user) return;
    try {
      setError(null);
      await deleteUser(user.id);
      navigate("/users");
    } catch (err: any) {
      setError(err?.message || "Failed to delete user.");
    }
  }

  // Group permissions by module (same logic as RolesPage)
  const permissionModules = React.useMemo(() => {
    if (!user?.role?.permissions) return {};
    const modules: Record<string, string[]> = {};
    user.role.permissions.forEach((perm) => {
      const [module] = perm.split(":");
      if (!modules[module]) modules[module] = [];
      modules[module].push(perm);
    });
    return modules;
  }, [user?.role?.permissions]);

  const moduleNames = Object.keys(permissionModules).sort();

  // Get actor name for activity
  function getActorName(actorId: number): string {
    const actor = allUsers.find((u) => u.id === actorId);
    return actor?.name || "System";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading user...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">User not found</span>
        </div>
      </div>
    );
  }

  // Calculate quick stats
  const totalCompleted = performance 
    ? performance.projects.completed + performance.tasks.completed + performance.subtasks.completed
    : 0;
  const totalPending = performance
    ? performance.projects.pending + performance.tasks.pending + performance.subtasks.pending
    : 0;

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
          <Link to="/users" className="hover:text-foreground transition-colors">
            Users
          </Link>
          <span>/</span>
          <span className="text-foreground">{user.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {user.hasAvatar ? (
              <img
                src={getAvatarUrl(user.id)}
                alt={user.name}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-lg flex-shrink-0 ${user.hasAvatar ? 'hidden' : ''}`}>
              {getInitials(user.name)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{user.name}</h1>
              {user.active ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                  Inactive
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
            >
              <Edit2 size={16} /> Edit User
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <MoreVertical size={18} className="text-muted-foreground" />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg py-1 z-10 w-40">
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowDelete(true);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Delete User
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {(["overview", "permissions", "projects", "activity"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-foreground border-b-2 border-[#0C1022]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "overview" && "Overview"}
              {tab === "permissions" && "Permissions"}
              {tab === "projects" && "Projects & Tasks"}
              {tab === "activity" && "Activity"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* User Information Card */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <User size={18} className="text-blue-500" /> User Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Full Name</p>
                <p className="text-sm text-foreground">{user.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="text-sm text-foreground">{user.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Department</p>
                <p className="text-sm text-foreground">{user.department?.name || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Role</p>
                <p className="text-sm text-foreground">{user.role?.name || "No role"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Member Since</p>
                <p className="text-sm text-foreground">{fmtDate(user.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats Card */}
          {performance && (
            <div className="bg-white rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-500" /> Quick Stats
              </h2>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assigned Projects</p>
                  <p className="text-2xl font-bold text-foreground">{performance.projects.total}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assigned Tasks</p>
                  <p className="text-2xl font-bold text-foreground">{performance.tasks.total}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Completed</p>
                  <p className="text-2xl font-bold text-emerald-600">{totalCompleted}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">{totalPending}</p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Tasks: {performance.tasks.completed} completed - {performance.tasks.onTime} on time, {performance.tasks.late} late</p>
              </div>
            </div>
          )}

          {/* Manager Card */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Briefcase size={18} className="text-blue-500" /> Manager / Reporting To
            </h2>
            {user.manager ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-semibold">
                  {getInitials(user.manager.name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{user.manager.name}</p>
                  <p className="text-xs text-muted-foreground">{user.manager.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No manager assigned</p>
            )}
          </div>

          {/* Account Status Card */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity size={18} className="text-blue-500" /> Account Status
            </h2>
            <div className="flex items-center gap-3">
              {user.active ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={14} /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                  <XCircle size={14} /> Inactive
                </span>
              )}
              <p className="text-sm text-muted-foreground">
                {user.active ? "User can log in and access the system" : "User cannot log in"}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <div className="space-y-6">
          {/* Current Role */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Current Role</h2>
            {user.role ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-semibold">
                  {getInitials(user.role.name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{user.role.name}</p>
                  <p className="text-xs text-muted-foreground">{user.role.description || "No description"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No role assigned</p>
            )}
          </div>

          {/* Effective Permissions */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Effective Permissions</h2>
            {user.role ? (
              <div className="space-y-4">
                {moduleNames.map((module) => (
                  <div key={module}>
                    <h3 className="text-sm font-medium text-foreground mb-2 capitalize">{module}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {permissionModules[module].map((perm) => (
                        <div key={perm} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          {perm}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No role assigned — no permissions.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "projects" && performance && (
        <div className="space-y-6">
          {/* Projects Led */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Projects Led</h2>
            <div className="grid grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total</p>
                <p className="text-xl font-bold text-foreground">{performance.projects.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Completed</p>
                <p className="text-xl font-bold text-emerald-600">{performance.projects.completed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">On Time</p>
                <p className="text-xl font-bold text-blue-600">{performance.projects.onTime}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Late</p>
                <p className="text-xl font-bold text-amber-600">{performance.projects.late}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Overdue</p>
                <p className="text-xl font-bold text-red-600">{performance.projects.overdue}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pending</p>
                <p className="text-xl font-bold text-gray-600">{performance.projects.pending}</p>
              </div>
            </div>
          </div>

          {/* Tasks Led */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Tasks Led</h2>
            <div className="grid grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total</p>
                <p className="text-xl font-bold text-foreground">{performance.tasks.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Completed</p>
                <p className="text-xl font-bold text-emerald-600">{performance.tasks.completed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">On Time</p>
                <p className="text-xl font-bold text-blue-600">{performance.tasks.onTime}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Late</p>
                <p className="text-xl font-bold text-amber-600">{performance.tasks.late}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Overdue</p>
                <p className="text-xl font-bold text-red-600">{performance.tasks.overdue}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pending</p>
                <p className="text-xl font-bold text-gray-600">{performance.tasks.pending}</p>
              </div>
            </div>
          </div>

          {/* Subtasks Assigned */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Subtasks Assigned</h2>
            <div className="grid grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total</p>
                <p className="text-xl font-bold text-foreground">{performance.subtasks.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Completed</p>
                <p className="text-xl font-bold text-emerald-600">{performance.subtasks.completed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">On Time</p>
                <p className="text-xl font-bold text-blue-600">{performance.subtasks.onTime}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Late</p>
                <p className="text-xl font-bold text-amber-600">{performance.subtasks.late}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Overdue</p>
                <p className="text-xl font-bold text-red-600">{performance.subtasks.overdue}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pending</p>
                <p className="text-xl font-bold text-gray-600">{performance.subtasks.pending}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Activity Log</h2>
          {activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((entry) => (
                <div key={entry.createdAt} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {getInitials(getActorName(entry.actorId))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{getActorName(entry.actorId)}</span> {entry.action}
                    </p>
                    {entry.detail && (
                      <p className="text-sm text-muted-foreground mt-1">{entry.detail}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{fmtDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      {showEdit && (
        <Dlg
          onClose={() => setShowEdit(false)}
          title="Edit User"
        >
          <div className="space-y-4">
            <FldInput
              label="Full Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <FldInput
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <FldSelect
              label="Department"
              value={editForm.departmentId}
              onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
              options={[
                { value: "", label: "Unassigned" },
                ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
              ]}
            />
            <FldSelect
              label="Role"
              value={editForm.roleId}
              onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
              options={[
                { value: "", label: "No role" },
                ...assignableRoles.map((r) => ({ value: r.id.toString(), label: r.name })),
              ]}
            />
            <FldSelect
              label="Manager"
              value={editForm.managerId}
              onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}
              options={[
                { value: "", label: "None" },
                ...managerOptions.map((u) => ({ value: u.id.toString(), label: u.name })),
              ]}
            />

            <FldInput
              label="New Password"
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              placeholder="Leave blank to keep current password"
            />

            {/* Avatar Upload */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Profile Picture</label>
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
                    setEditAvatarFile(file);
                    setAvatarUploadError(null);
                  }
                }}
                className="hidden"
                id="edit-avatar-upload"
              />

              {editAvatarFile ? (
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Upload size={16} className="text-blue-500" />
                    <span className="text-sm text-foreground">{editAvatarFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditAvatarFile(null)}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : user.hasAvatar ? (
                <div className="flex items-center gap-4">
                  <img
                    src={getAvatarUrl(user.id)}
                    alt="Current avatar"
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex gap-2">
                    <label htmlFor="edit-avatar-upload" className="cursor-pointer">
                      <button type="button" className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
                        Update Picture
                      </button>
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Remove Picture
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer">
                  <label htmlFor="edit-avatar-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={20} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload photo, JPG/PNG up to 2MB</span>
                    </div>
                  </label>
                </div>
              )}
              {avatarUploadError && (
                <p className="text-xs text-red-600 mt-1">{avatarUploadError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Account Status</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="active"
                    checked={editForm.active}
                    onChange={() => setEditForm({ ...editForm, active: true })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="active"
                    checked={!editForm.active}
                    onChange={() => setEditForm({ ...editForm, active: false })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-foreground">Inactive</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm bg-[#0C1022] text-white rounded-lg hover:bg-[#1a2240] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {/* Delete Dialog */}
      {showDelete && (
        <Dlg
          onClose={() => setShowDelete(false)}
          title="Delete User"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete <strong>{user.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
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
