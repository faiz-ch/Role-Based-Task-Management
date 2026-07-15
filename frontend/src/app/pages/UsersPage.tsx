import React, { useState, useEffect } from "react";
import { Edit2, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { UserType, Role, Department } from "../types";
import { getUsers, updateUser, assignRole, createUser, deleteUser, assignDepartment } from "../api/users";
import { getRoles } from "../api/roles";
import { getDepartments } from "../api/departments";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { useAuth } from "../context/AuthContext";

export function UsersPage() {
  const { permissions, currentUser } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editUser, setEditUser] = useState<UserType | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserType | null>(null);

  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("");
  const [newUserDepartment, setNewUserDepartment] = useState("");

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

  async function handleRoleChange(uid: number, roleIdStr: string) {
    try {
      setError(null);
      const roleId = roleIdStr === "" ? null : Number(roleIdStr);
      const updatedUser = await assignRole(uid, roleId);
      setUsers((prev) => prev.map((u) => (u.id === uid ? updatedUser : u)));
    } catch (err: any) {
      setError(err?.message || "Failed to assign role.");
    }
  }

  async function handleDepartmentChange(uid: number, deptIdStr: string) {
    try {
      setError(null);
      const deptId = deptIdStr === "" ? null : Number(deptIdStr);
      const updatedUser = await assignDepartment(uid, deptId);
      setUsers((prev) => prev.map((u) => (u.id === uid ? updatedUser : u)));
    } catch (err: any) {
      setError(err?.message || "Failed to assign department.");
    }
  }

  async function saveEdit() {
    if (!editUser || !editName.trim() || !editEmail.trim()) {
      setEditError("Name and email are required.");
      return;
    }
    try {
      setEditError(null);
      setError(null);

      const updateData: any = {};
      if (editName.trim() !== editUser.name) {
        updateData.name = editName.trim();
      }
      if (editEmail.trim().toLowerCase() !== editUser.email) {
        updateData.email = editEmail.trim().toLowerCase();
      }
      if (editPassword) {
        updateData.password = editPassword;
      }
      if (editActive !== editUser.active) {
        updateData.active = editActive;
      }

      const updatedUser = await updateUser(editUser.id, updateData);
      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? updatedUser : u))
      );
      setEditUser(null);
      setEditError(null);
    } catch (err: any) {
      if (err?.message?.includes("email")) {
        setEditError(err.message);
      } else if (err?.status === 404) {
        setUsers((prev) => prev.filter((u) => u.id !== editUser!.id));
        setEditUser(null);
        setError("User no longer exists.");
      } else {
        setEditError(err?.message || "Failed to update user.");
      }
    }
  }

  async function handleDelete(user: UserType) {
    try {
      setError(null);
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setDeleteConfirmUser(null);
    } catch (err: any) {
      if (err?.status === 404) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        setDeleteConfirmUser(null);
        setError("User already deleted.");
      } else {
        setError(err?.message || "Failed to delete user.");
      }
    }
  }

  async function handleCreateUser() {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      setError("All fields are required.");
      return;
    }
    try {
      setError(null);
      const roleId = newUserRole ? Number(newUserRole) : undefined;
      const deptId = newUserDepartment ? Number(newUserDepartment) : undefined;
      const newUser = await createUser({
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        password: newUserPassword,
        role_id: roleId,
        department_id: deptId,
      });
      setUsers((prev) => [...prev, newUser]);
      setShowNewUserDialog(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("");
      setNewUserDepartment("");
    } catch (err: any) {
      setError(err?.message || "Failed to create user.");
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">{users.length} registered accounts</p>
        </div>
        {permissions.includes("user:manage") && (
          <button
            onClick={() => setShowNewUserDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={16} />
            New User
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["User", "Email", "Role", "Department", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Av name={user.name} size="md" />
                      <span className="text-sm font-semibold text-foreground">
                        {user.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono text-muted-foreground">
                      {user.email}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={user.role?.id ?? ""}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-foreground focus:outline-none focus:border-blue-400 min-w-[120px]"
                    >
                      <option value="">No role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={user.department?.id ?? ""}
                      onChange={(e) => handleDepartmentChange(user.id, e.target.value)}
                      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-foreground focus:outline-none focus:border-blue-400 min-w-[120px]"
                    >
                      <option value="">No department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        user.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          user.active ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditUser(user);
                          setEditName(user.name);
                          setEditEmail(user.email);
                          setEditPassword("");
                          setEditActive(user.active);
                          setEditError(null);
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => setDeleteConfirmUser(user)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 transition-colors font-medium cursor-pointer"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editUser && (
        <Dlg title="Edit user" onClose={() => setEditUser(null)}>
          <div className="space-y-4">
            <FldInput
              label="Full name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <FldInput
              label="Email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
            <FldInput
              label="New password (optional)"
              type="password"
              placeholder="Leave blank to keep current password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
              <select
                value={editActive ? "true" : "false"}
                onChange={(e) => setEditActive(e.target.value === "true")}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-foreground focus:outline-none focus:border-blue-400"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            {editError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditUser(null)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {showNewUserDialog && (
        <Dlg title="Create new user" onClose={() => setShowNewUserDialog(false)}>
          <div className="space-y-4">
            <FldInput
              label="Full name"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              autoFocus
            />
            <FldInput
              label="Email"
              type="email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />
            <FldInput
              label="Password"
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role (optional)</label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-foreground focus:outline-none focus:border-blue-400"
              >
                <option value="">No role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Department (optional)</label>
              <select
                value={newUserDepartment}
                onChange={(e) => setNewUserDepartment(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white text-foreground focus:outline-none focus:border-blue-400"
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewUserDialog(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {deleteConfirmUser && (
        <Dlg
          title="Delete user"
          onClose={() => setDeleteConfirmUser(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete <strong>{deleteConfirmUser.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
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
