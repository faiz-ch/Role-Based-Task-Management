import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, ChevronDown, ChevronRight, Trash2, Check, ChevronLeft, ArrowRight } from "lucide-react";
import { Project, UserType, ProjectStatus, Priority, Department, Task } from "../types";
import { useAuth } from "../context/AuthContext";
import { getProjects, createProject, deleteProject } from "../api/projects";
import { getTasks } from "../api/tasks";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { PriBadge } from "../components/PriBadge";
import { DatePicker } from "../components/DatePicker";
import { getEffectiveDepartmentIds } from "../utils/roleAccess";

const PROJECT_STATUSES: ProjectStatus[] = ["Planning", "Active", "Done", "Archived"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

const COLOR_SWATCHES = [
  { name: "purple", value: "#a855f7", bg: "bg-purple-100", text: "text-purple-600" },
  { name: "blue", value: "#3b82f6", bg: "bg-blue-100", text: "text-blue-600" },
  { name: "green", value: "#10b981", bg: "bg-emerald-100", text: "text-emerald-600" },
  { name: "orange", value: "#f97316", bg: "bg-orange-100", text: "text-orange-600" },
  { name: "red", value: "#ef4444", bg: "bg-red-100", text: "text-red-600" },
];

const PROJECT_STATUS_STYLE: Record<ProjectStatus, { badge: string; dot: string }> = {
  Planning: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  Active: {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  Done: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  Archived: {
    badge: "bg-gray-50 text-gray-600 border-gray-200",
    dot: "bg-gray-400",
  },
};

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS_STYLE[status];
  if (!s) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${s.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {status}
    </span>
  );
}

interface PForm {
  name: string;
  description: string;
  priority: Priority;
  startDate: string;
  dueDate: string;
  departmentIds: number[];
  color: string;
  leadId: string;
  teamUserIds: number[];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { currentUser, permissions } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const [showNew, setShowNew] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [teamSearch, setTeamSearch] = useState("");
  const [form, setForm] = useState<PForm>({
    name: "",
    description: "",
    priority: "Medium",
    startDate: "",
    dueDate: "",
    departmentIds: [],
    color: "blue",
    leadId: "",
    teamUserIds: [],
  });

  const canCreate = permissions.includes("project:manage");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [projectsResult, usersResult, departmentsResult, tasksResult] = await Promise.allSettled([
          getProjects(),
          getUsers(),
          getDepartments(),
          getTasks(),
        ]);

        setProjects(projectsResult.status === "fulfilled" ? projectsResult.value : []);
        setUsers(usersResult.status === "fulfilled" ? usersResult.value : []);
        setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value : []);
        setTasks(tasksResult.status === "fulfilled" ? tasksResult.value : []);

        if (projectsResult.status === "rejected") {
          setError((projectsResult.reason as any)?.message || "Failed to load projects.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredProjects = projects.filter((project) => {
    if (filterStatus && project.status !== filterStatus) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!project.name.toLowerCase().includes(query) && 
          !project.description.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    return true;
  });

  function openNew() {
    setForm({
      name: "",
      description: "",
      priority: "Medium",
      startDate: "",
      dueDate: "",
      departmentIds: [],
      color: "blue",
      leadId: "",
      teamUserIds: [],
    });
    setWizardStep(1);
    setTeamSearch("");
    setShowNew(true);
  }

  function canProceedToStep2() {
    return form.name.trim() !== "" && form.dueDate !== "";
  }

  function canProceedToStep3() {
    return form.leadId !== "";
  }

  function getEligibleLeaders() {
    return users.filter((u) => 
      u.role?.permissions?.includes("task:manage") || u.role?.permissions?.includes("task:create")
    );
  }

  function getEligibleTeamMembers() {
    const eligibleDepts = form.departmentIds;
    if (eligibleDepts.length === 0) return [];
    return users.filter((u) => 
      u.department && eligibleDepts.includes(u.department.id)
    );
  }

  function toggleTeamMember(userId: number) {
    setForm((prev) => ({
      ...prev,
      teamUserIds: prev.teamUserIds.includes(userId) 
        ? prev.teamUserIds.filter((id) => id !== userId) 
        : [...prev.teamUserIds, userId],
    }));
  }

  async function saveNew() {
    if (!form.name.trim()) return;
    if (form.departmentIds.length === 0) {
      setError("Please select at least one department");
      return;
    }
    try {
      setError(null);
      const newProject = await createProject({
        name: form.name.trim(),
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate,
        departmentIds: form.departmentIds,
        startDate: form.startDate,
        color: form.color,
        leadId: form.leadId ? Number(form.leadId) : undefined,
        teamUserIds: form.teamUserIds,
      });
      setProjects((prev) => [...prev, newProject]);
      setShowNew(false);
      setWizardStep(1);
    } catch (err: any) {
      setError(err?.message || "Failed to create project.");
    }
  }

  async function handleDeleteProject() {
    if (!projectToDelete) return;
    try {
      setError(null);
      await deleteProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setShowDeleteConfirm(false);
      setProjectToDelete(null);
    } catch (err: any) {
      setError(err?.message || "Failed to delete project.");
    }
  }

  function openDeleteConfirm(project: Project) {
    setProjectToDelete(project);
    setShowDeleteConfirm(true);
  }

  function toggleDepartment(deptId: number) {
    setForm((prev) => ({
      ...prev,
      departmentIds: prev.departmentIds.includes(deptId)
        ? prev.departmentIds.filter((id) => id !== deptId)
        : [...prev.departmentIds, deptId],
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading projects...</span>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length} total projects
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={14} /> New Project
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm flex-shrink-0">
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
        >
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {filteredProjects.map((project) => {
          const projectTasks = tasks.filter((t) => t.projectId === project.id);
          const totalTasks = projectTasks.length;
          const doneTasks = projectTasks.filter((t) => t.status === "Done").length;
          const hasTasks = totalTasks > 0;
          const progressPercent = hasTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
          
          const teamMembers = users.filter((u) => project.teamUserIds.includes(u.id));
          const visibleAvatars = teamMembers.slice(0, 3);
          const overflowCount = Math.max(0, teamMembers.length - 3);
          
          return (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="bg-white rounded-xl border border-border p-4 hover:bg-muted/20 transition-colors cursor-pointer relative"
            >
              {canCreate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteConfirm(project);
                  }}
                  className="absolute top-4 right-4 p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer flex-shrink-0"
                  title="Delete project"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              )}
              
              <div className="pr-8">
                <ProjectStatusBadge status={project.status} />
                
                <h3 className="text-base font-semibold text-foreground mt-2 mb-3">
                  {project.name}
                </h3>
                
                {hasTasks ? (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Progress</span>
                      <span className="font-medium text-foreground">{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 text-xs text-muted-foreground italic">
                    No tasks yet
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {visibleAvatars.map((member, idx) => (
                      <div
                        key={member.id}
                        className="-ml-2 first:ml-0 relative"
                        style={{ zIndex: visibleAvatars.length - idx }}
                      >
                        <Av name={member.name} size="sm" />
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <div className="-ml-2 w-7 h-7 rounded-full bg-muted border-2 border-white flex items-center justify-center text-xs font-medium text-muted-foreground relative" style={{ zIndex: 0 }}>
                        +{overflowCount}
                      </div>
                    )}
                    {teamMembers.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No team members</span>
                    )}
                  </div>
                  
                  {hasTasks && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check size={14} className="text-emerald-500" />
                      <span className="font-medium text-foreground">{doneTasks}/{totalTasks}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredProjects.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No projects match the current filters
          </div>
        )}
      </div>

      {showNew && (
        <Dlg title="New Project" onClose={() => setShowNew(false)}>
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {[1, 2, 3].map((step) => (
              <React.Fragment key={step}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      wizardStep === step
                        ? "bg-blue-500 text-white"
                        : wizardStep > step
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {wizardStep > step ? <Check size={16} /> : step}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      wizardStep === step ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step === 1 ? "Basic Info" : step === 2 ? "Team" : "Review"}
                  </span>
                </div>
                {step < 3 && (
                  <div
                    className={`w-12 h-0.5 ${
                      wizardStep > step ? "bg-emerald-500" : "bg-muted"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Basic Information */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <FldInput
                label="Project Name"
                placeholder="Enter project name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Description
                </span>
                <textarea
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none placeholder:text-muted-foreground/60 text-foreground"
                  rows={3}
                  placeholder="Optional project description..."
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FldSelect
                  label="Priority"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value as Priority }))
                  }
                  options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                />
                <DatePicker
                  label="Start Date"
                  value={form.startDate}
                  onChange={(value) => setForm((f) => ({ ...f, startDate: value }))}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
              <DatePicker
                label="Due Date"
                value={form.dueDate}
                onChange={(value) => setForm((f) => ({ ...f, dueDate: value }))}
                min={form.startDate || new Date().toISOString().slice(0, 16)}
              />
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Departments
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {departments.map((dept) => (
                    <label
                      key={dept.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.departmentIds.includes(dept.id)}
                        onChange={() => toggleDepartment(dept.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-foreground">{dept.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Project Color
                </span>
                <div className="flex gap-2">
                  {COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.name}
                      onClick={() => setForm((f) => ({ ...f, color: swatch.name }))}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        form.color === swatch.name
                          ? "ring-2 ring-offset-2 ring-blue-500 scale-110"
                          : "hover:ring-2 hover:ring-offset-2 hover:ring-blue-300"
                      } ${swatch.bg}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Project Team */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <FldSelect
                label="Project Leader"
                value={form.leadId}
                onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
                options={[
                  { value: "", label: "Select a leader" },
                  ...getEligibleLeaders().map((u) => ({ value: u.id.toString(), label: u.name })),
                ]}
              />
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Team Members
                </span>
                <input
                  type="text"
                  placeholder="Search team members..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 mb-2"
                />
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {getEligibleTeamMembers().length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {form.departmentIds.length === 0 
                        ? "Select departments first to see eligible team members" 
                        : "No eligible users in selected departments"}
                    </p>
                  ) : (
                    getEligibleTeamMembers()
                      .filter((member) => member.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.teamUserIds.includes(member.id)}
                          onChange={() => toggleTeamMember(member.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Av name={member.name} size="sm" />
                        <span className="text-sm text-foreground">{member.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review & Create */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Project Name</span>
                  <p className="text-sm font-medium text-foreground mt-1">{form.name}</p>
                </div>
                {form.description && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Description</span>
                    <p className="text-sm text-foreground mt-1">{form.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Priority</span>
                    <p className="text-sm text-foreground mt-1">{form.priority}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</span>
                    <p className="text-sm text-foreground mt-1">{fmtDate(form.dueDate)}</p>
                  </div>
                </div>
                {form.startDate && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Start Date</span>
                    <p className="text-sm text-foreground mt-1">{fmtDate(form.startDate)}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Departments</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.departmentIds.map((deptId) => {
                      const dept = departments.find((d) => d.id === deptId);
                      return dept ? (
                        <span key={deptId} className="px-2 py-0.5 bg-muted rounded text-xs">
                          {dept.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Color</span>
                  <div className={`w-4 h-4 rounded ${COLOR_SWATCHES.find((s) => s.name === form.color)?.bg}`} />
                  <span className="text-sm text-foreground capitalize">{form.color}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Project Leader</span>
                  <p className="text-sm text-foreground mt-1">
                    {form.leadId ? users.find((u) => u.id === Number(form.leadId))?.name || "Unknown" : "Not selected"}
                  </p>
                </div>
                {form.teamUserIds.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Team Members</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {form.teamUserIds.map((userId) => {
                        const user = users.find((u) => u.id === userId);
                        return user ? (
                          <div key={userId} className="flex items-center gap-1">
                            <Av name={user.name} size="sm" />
                            <span className="text-xs text-foreground">{user.name}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-5 pt-4 border-t border-border">
            <div className="flex gap-2">
              {wizardStep > 1 && (
                <button
                  onClick={() => setWizardStep((prev) => prev - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {wizardStep < 3 ? (
                <button
                  onClick={() => setWizardStep((prev) => prev + 1)}
                  disabled={wizardStep === 1 ? !canProceedToStep2() : !canProceedToStep3()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  onClick={saveNew}
                  className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
                >
                  Create Project
                </button>
              )}
            </div>
          </div>
        </Dlg>
      )}

      {showDeleteConfirm && (
        <Dlg title="Delete project" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete "{projectToDelete?.name}"? This will also delete all tasks and subtasks in this project. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
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
