import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Edit2, Trash2, MoreVertical, ChevronDown, Users, Building2, Calendar, AlertTriangle } from "lucide-react";
import { Department, UserType, Project, Task } from "../types";
import { getDepartment, updateDepartment, deleteDepartment, getDepartmentActivity } from "../api/departments";
import { getUsers } from "../api/users";
import { getProjects } from "../api/projects";
import { getTasks } from "../api/tasks";
import { getDepartments } from "../api/departments";
import { Dlg } from "../components/Dlg";
import { FldSelect } from "../components/FldSelect";
import { Av } from "../components/Av";

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

type Tab = "overview" | "members" | "projects" | "activity";

export function DepartmentDetailPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const navigate = useNavigate();
  const [department, setDepartment] = useState<Department | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [activity, setActivity] = useState<{
    actorId: number;
    action: string;
    detail: string | null;
    createdAt: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [editForm, setEditForm] = useState({
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

  const [membersPage, setMembersPage] = useState(1);
  const membersPerPage = 5;

  useEffect(() => {
    async function loadData() {
      if (!departmentId) return;
      try {
        setLoading(true);
        setError(null);
        const [dept, usersData, projectsData, tasksData, activityData, deptsData] = await Promise.all([
          getDepartment(Number(departmentId)),
          getUsers(),
          getProjects(),
          getTasks(),
          getDepartmentActivity(Number(departmentId)),
          getDepartments(),
        ]);
        setDepartment(dept);
        setUsers(usersData);
        setProjects(projectsData);
        setTasks(tasksData);
        setActivity(activityData);
        setAllDepartments(deptsData);
        setEditForm({
          name: dept.name,
          description: dept.description || "",
          headId: dept.headId,
          color: dept.color,
          isActive: dept.isActive,
        });
      } catch (err: any) {
        setError(err?.message || "Failed to load department details.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [departmentId]);

  const departmentUsers = users.filter((u) => u.department?.id === Number(departmentId));
  const departmentProjects = projects.filter((p) => p.departmentIds.includes(Number(departmentId)));
  const activeProjects = departmentProjects.filter((p) => p.status === "Active");

  const paginatedMembers = departmentUsers.slice(
    (membersPage - 1) * membersPerPage,
    membersPage * membersPerPage
  );

  async function handleSaveEdit() {
    if (!department) return;
    try {
      setError(null);
      const updated = await updateDepartment(department.id, {
        name: editForm.name,
        description: editForm.description,
        headId: editForm.headId,
        color: editForm.color,
        isActive: editForm.isActive,
      });
      setDepartment(updated);
      setShowEdit(false);
    } catch (err: any) {
      setError(err?.message || "Failed to update department.");
    }
  }

  async function handleDelete() {
    if (!department) return;
    try {
      setError(null);
      await deleteDepartment(
        department.id,
        deleteForm.moveUsersTo || undefined,
        deleteForm.moveProjectsTo || undefined
      );
      navigate("/departments");
    } catch (err: any) {
      setError(err?.message || "Failed to delete department.");
    }
  }

  function canDelete() {
    if (!department) return false;
    if (department.memberCount > 0 && deleteForm.moveUsersTo === null) return false;
    if (department.projectCount > 0 && deleteForm.moveProjectsTo === null) return false;
    return true;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading department...</span>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">Department not found</span>
        </div>
      </div>
    );
  }

  const colorClasses = getColorClasses(department.color);
  const otherDepartments = allDepartments.filter((d) => d.id !== department.id);

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
          <Link to="/departments" className="hover:text-foreground transition-colors">
            Departments
          </Link>
          <span>/</span>
          <span className="text-foreground">{department.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg ${colorClasses.bg} ${colorClasses.text} flex items-center justify-center font-semibold text-lg flex-shrink-0`}>
              {getInitials(department.name)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{department.name}</h1>
              {department.isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Inactive
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-sm font-medium text-foreground"
            >
              <Edit2 size={14} /> Edit Department
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 hover:bg-muted rounded-lg transition-colors cursor-pointer"
              >
                <MoreVertical size={16} />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-10">
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowDelete(true);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={14} /> Delete Department
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Members</span>
            </div>
            <p className="text-xl font-bold text-foreground">{department.memberCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Projects</span>
            </div>
            <p className="text-xl font-bold text-foreground">{department.projectCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Department Head</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {department.head ? department.head.name : "Unassigned"}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Created Date</span>
            </div>
            <p className="text-sm font-medium text-foreground">{fmtDate(department.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {(["overview", "members", "projects", "activity"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">About Department</h2>
            <p className="text-sm text-foreground leading-relaxed">
              {department.description || "No description provided"}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Department Head</h2>
            {department.head ? (
              <div className="flex items-center gap-3">
                <Av name={department.head.name} />
                <div>
                  <p className="text-sm font-medium text-foreground">{department.head.name}</p>
                  <p className="text-xs text-muted-foreground">{department.head.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No department head assigned</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Department Statistics</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Members</span>
                <span className="text-sm font-medium text-foreground">{department.memberCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Projects</span>
                <span className="text-sm font-medium text-foreground">{activeProjects.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "members" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Department Members</h2>
          </div>
          {departmentUsers.length === 0 ? (
            <div className="px-6 py-12 text-sm text-muted-foreground text-center">
              No members in this department yet.
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedMembers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Av name={user.name} />
                          <span className="text-sm font-medium text-foreground">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-foreground">{user.role?.name || "No role"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-muted-foreground">{user.email}</span>
                      </td>
                      <td className="px-6 py-4">
                        {user.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {departmentUsers.length > membersPerPage && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Showing {(membersPage - 1) * membersPerPage + 1} to {Math.min(membersPage * membersPerPage, departmentUsers.length)} of {departmentUsers.length} members
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.ceil(departmentUsers.length / membersPerPage) }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setMembersPage(i + 1)}
                        className={`px-2 py-1 text-xs rounded ${
                          membersPage === i + 1
                            ? "bg-blue-500 text-white"
                            : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "projects" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Department Projects</h2>
          </div>
          {departmentProjects.length === 0 ? (
            <div className="px-6 py-12 text-sm text-muted-foreground text-center">
              No projects in this department yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {departmentProjects.map((project) => {
                const projectTasks = tasks.filter((t) => t.projectId === project.id);
                const totalTasks = projectTasks.length;
                const doneTasks = projectTasks.filter((t) => t.status === "Done").length;
                const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="px-6 py-4 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-foreground">{project.name}</h3>
                      <span className="text-xs text-muted-foreground">{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Activity Log</h2>
          </div>
          {activity.length === 0 ? (
            <div className="px-6 py-12 text-sm text-muted-foreground text-center">
              No activity yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activity.map((entry) => {
                const actor = users.find((u) => u.id === entry.actorId);
                const actorName = actor?.name || "Someone";
                return (
                  <div key={entry.createdAt} className="px-6 py-4">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{actorName}</span>{" "}
                      {entry.detail ? entry.detail : entry.action}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{fmtDateTime(entry.createdAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      {showEdit && (
        <Dlg title="Edit Department" onClose={() => setShowEdit(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Department Name
              </span>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Description
              </span>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[80px] resize-y"
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Department Head
              </span>
              <select
                value={editForm.headId ?? ""}
                onChange={(e) => setEditForm({ ...editForm, headId: e.target.value ? Number(e.target.value) : null })}
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
                    onClick={() => setEditForm({ ...editForm, color: swatch.name })}
                    className={`w-8 h-8 rounded-full cursor-pointer transition-all ${
                      editForm.color === swatch.name
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
                    checked={editForm.isActive}
                    onChange={() => setEditForm({ ...editForm, isActive: true })}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={!editForm.isActive}
                    onChange={() => setEditForm({ ...editForm, isActive: false })}
                    className="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
                  />
                  <span className="text-sm text-foreground">Inactive</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEdit(false)}
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

      {/* Delete Dialog */}
      {showDelete && (
        <Dlg title="Delete Department" onClose={() => setShowDelete(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              This department contains: <strong>{department.memberCount} Users</strong>, <strong>{department.projectCount} Projects</strong>.
            </p>

            {department.memberCount > 0 && (
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
                  {otherDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {department.projectCount > 0 && (
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
                  {otherDepartments.map((dept) => (
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
                  setShowDelete(false);
                  setDeleteForm({ moveUsersTo: null, moveProjectsTo: null });
                }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
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
