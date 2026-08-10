import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, AlertTriangle, Trash2, Search, MoreVertical, Eye } from "lucide-react";
import { Department, UserType } from "../types";
import { getDepartments, createDepartment, deleteDepartment } from "../api/departments";
import { getUsers } from "../api/users";
import { Dlg } from "../components/Dlg";

const COLOR_SWATCHES = [
  { name: "purple", value: "#a855f7", bg: "bg-purple-100", text: "text-purple-600" },
  { name: "blue", value: "#3b82f6", bg: "bg-blue-100", text: "text-blue-600" },
  { name: "green", value: "#10b981", bg: "bg-emerald-100", text: "text-emerald-600" },
  { name: "orange", value: "#f97316", bg: "bg-orange-100", text: "text-orange-600" },
  { name: "red", value: "#ef4444", bg: "bg-red-100", text: "text-red-600" },
];

function getColorClasses(color: string) {
  const swatch = COLOR_SWATCHES.find((s) => s.name === color) || COLOR_SWATCHES[4];
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

export function DepartmentsPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);

  const [newForm, setNewForm] = useState({
    name: "",
    description: "",
    headId: null as number | null,
    color: "purple",
    isActive: true,
  });

  const [deleteForm, setDeleteForm] = useState({
    moveUsersTo: null as number | null,
    moveProjectsTo: null as number | null,
  });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedDepts, fetchedUsers] = await Promise.all([
          getDepartments(),
          getUsers(),
        ]);
        setDepartments(fetchedDepts);
        setUsers(fetchedUsers);
      } catch (err: any) {
        setError(err?.message || "Failed to load departments.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredDepartments = departments.filter((dept) =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalDepartments = departments.length;
  const totalEmployees = departments.reduce((sum, dept) => sum + dept.memberCount, 0);
  const departmentHeads = departments.filter((dept) => dept.head !== null).length;
  const activeDepartments = departments.filter((dept) => dept.isActive).length;

  async function handleCreateDepartment() {
    if (!newForm.name.trim()) return;
    try {
      setError(null);
      const nd = await createDepartment({
        name: newForm.name.trim(),
        description: newForm.description.trim() || undefined,
        headId: newForm.headId,
        color: newForm.color,
        isActive: newForm.isActive,
      });
      setDepartments((prev) => [...prev, nd]);
      setNewForm({ name: "", description: "", headId: null, color: "purple", isActive: true });
      setShowNew(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create department.");
    }
  }

  async function handleDeleteDepartment() {
    if (!deptToDelete) return;
    try {
      setError(null);
      await deleteDepartment(
        deptToDelete.id,
        deleteForm.moveUsersTo || undefined,
        deleteForm.moveProjectsTo || undefined
      );
      setDepartments((prev) => prev.filter((d) => d.id !== deptToDelete.id));
      setShowDeleteConfirm(false);
      setDeptToDelete(null);
      setDeleteForm({ moveUsersTo: null, moveProjectsTo: null });
    } catch (err: any) {
      setError(err?.message || "Failed to delete department.");
    }
  }

  function canDelete() {
    if (!deptToDelete) return false;
    if (deptToDelete.memberCount > 0 && deleteForm.moveUsersTo === null) return false;
    if (deptToDelete.projectCount > 0 && deleteForm.moveProjectsTo === null) return false;
    return true;
  }

  function openDeleteConfirm(dept: Department) {
    setDeptToDelete(dept);
    setDeleteForm({ moveUsersTo: null, moveProjectsTo: null });
    setShowDeleteConfirm(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading departments...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Departments</h1>
        <p className="text-sm text-muted-foreground">Manage organizational departments</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Total Departments</p>
          <p className="text-2xl font-bold text-foreground">{totalDepartments}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-foreground">{totalEmployees}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Department Heads</p>
          <p className="text-2xl font-bold text-foreground">{departmentHeads}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Active Departments</p>
          <p className="text-2xl font-bold text-foreground">{activeDepartments}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 text-foreground"
            />
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={16} /> New Department
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Department Head
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Members
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Projects
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-sm text-muted-foreground text-center">
                    {searchQuery ? "No departments match your search." : "No departments yet. Create one to get started."}
                  </td>
                </tr>
              ) : (
                filteredDepartments.map((dept) => {
                  const colorClasses = getColorClasses(dept.color);
                  return (
                    <tr
                      key={dept.id}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => navigate(`/departments/${dept.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${colorClasses.bg} ${colorClasses.text} flex items-center justify-center font-semibold text-sm flex-shrink-0`}>
                            {getInitials(dept.name)}
                          </div>
                          <span className="text-sm font-medium text-foreground">{dept.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {dept.head ? (
                          <div>
                            <div className="text-sm font-medium text-foreground">{dept.head.name}</div>
                            <div className="text-xs text-muted-foreground">{dept.head.email}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-foreground">{dept.memberCount}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-foreground">{dept.projectCount}</span>
                      </td>
                      <td className="px-6 py-4">
                        {dept.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/departments/${dept.id}`)}
                            className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title="View department"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openDeleteConfirm(dept)}
                            className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Delete department"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Department Dialog */}
      {showNew && (
        <Dlg title="Create Department" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Department Name
              </span>
              <input
                type="text"
                placeholder="e.g. Engineering, Marketing"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                autoFocus
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60 text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Description
              </span>
              <textarea
                placeholder="Department description..."
                value={newForm.description}
                onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[80px] resize-y"
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Department Head
              </span>
              <select
                value={newForm.headId ?? ""}
                onChange={(e) => setNewForm({ ...newForm, headId: e.target.value ? Number(e.target.value) : null })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground"
              >
                <option value="">None</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Department Color
              </span>
              <div className="flex gap-3">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.name}
                    onClick={() => setNewForm({ ...newForm, color: swatch.name })}
                    className={`w-8 h-8 rounded-full cursor-pointer transition-all ${
                      newForm.color === swatch.name
                        ? "ring-2 ring-offset-2 ring-blue-500"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: swatch.value }}
                    title={swatch.name}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={newForm.isActive}
                    onChange={() => setNewForm({ ...newForm, isActive: true })}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={!newForm.isActive}
                    onChange={() => setNewForm({ ...newForm, isActive: false })}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="text-sm text-foreground">Inactive</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDepartment}
                className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
              >
                Save Department
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && deptToDelete && (
        <Dlg title="Delete Department" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              This department contains: <strong>{deptToDelete.memberCount} Users</strong>, <strong>{deptToDelete.projectCount} Projects</strong>.
            </p>

            {deptToDelete.memberCount > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Move Users To *
                </span>
                <select
                  value={deleteForm.moveUsersTo ?? ""}
                  onChange={(e) => setDeleteForm({ ...deleteForm, moveUsersTo: e.target.value ? Number(e.target.value) : null })}
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground"
                >
                  <option value="">Select a department...</option>
                  {departments.filter((d) => d.id !== deptToDelete.id).map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {deptToDelete.projectCount > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Move Projects To *
                </span>
                <select
                  value={deleteForm.moveProjectsTo ?? ""}
                  onChange={(e) => setDeleteForm({ ...deleteForm, moveProjectsTo: e.target.value ? Number(e.target.value) : null })}
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground"
                >
                  <option value="">Select a department...</option>
                  {departments.filter((d) => d.id !== deptToDelete.id).map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeptToDelete(null);
                  setDeleteForm({ moveUsersTo: null, moveProjectsTo: null });
                }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDepartment}
                disabled={!canDelete()}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Department
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
