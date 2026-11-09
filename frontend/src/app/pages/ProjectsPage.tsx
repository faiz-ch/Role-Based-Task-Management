import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, ChevronDown, ChevronRight, Trash2, Check, ChevronLeft, ArrowRight } from "lucide-react";
import { Project, UserType, ProjectStatus, Priority, Department, Area, Station, Division } from "../types";
import { getAreas, getStations, getDivisions } from "../api/organization";
import { ProjectOrgPicker, projectOrgProblem, worksOnProjectOrg } from "../components/ProjectOrgPicker";
import { grantableFor } from "../utils/orgScope";
import { managesAllDepartments } from "../utils/roleAccess";
import { useAuth } from "../context/AuthContext";
import { getProjects, createProject, deleteProject } from "../api/projects";
import { getUsers } from "../api/users";
import { getDepartments } from "../api/departments";
import { useCachedQuery, qk, FRESH, EMPTY } from "../api/queries";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { PriBadge } from "../components/PriBadge";
import { DatePicker } from "../components/DatePicker";
import { useErrorPopup } from "../utils/notify";
import { MultiSelect, FilterChips } from "../components/MultiSelect";

const PROJECT_STATUSES: ProjectStatus[] = ["Planning", "Active", "Pending Approval", "Done", "Archived"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

const COLOR_SWATCHES = [
  { name: "purple", value: "#a855f7", bg: "bg-purple-100", text: "text-purple-600" },
  { name: "blue", value: "#B08C2E", bg: "bg-blue-100", text: "text-blue-600" },
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
  "Pending Approval": {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
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
  stationIds: number[];
  divisionIds: number[];
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
  const canCreate = permissions.includes("project:manage");

  // Data comes from the shared store: instant when already loaded,
  // re-checked every 60 s and when returning to the tab.
  const projectsQ = useCachedQuery<Project[]>(qk.projects, getProjects, EMPTY, { staleTime: FRESH.LIVE, poll: true });
  const departmentsQ = useCachedQuery<Department[]>(qk.departments, getDepartments, EMPTY, { staleTime: FRESH.RARE });
  const areasQ = useCachedQuery<Area[]>(qk.areas, getAreas, EMPTY, { staleTime: FRESH.RARE });
  const stationsQ = useCachedQuery<Station[]>(qk.stations, () => getStations(), EMPTY, { staleTime: FRESH.RARE });
  const divisionsQ = useCachedQuery<Division[]>(qk.divisions, getDivisions, EMPTY, { staleTime: FRESH.RARE });
  const areas = areasQ.data, stations = stationsQ.data, divisions = divisionsQ.data;
  // Where I may place a project: departments at stations I manage (null = everything)
  const allowedPairs = managesAllDepartments(currentUser) ? null : [...grantableFor(currentUser, stations).pairs];
  // Users are only needed for the "New Project" lead/team picker
  const usersQ = useCachedQuery<UserType[]>(qk.users, getUsers, EMPTY, { staleTime: FRESH.NORMAL, enabled: canCreate });
  const projects = projectsQ.data;
  const setProjects = projectsQ.setData;
  const departments = departmentsQ.data;
  const users = usersQ.data;
  const loading = projectsQ.isLoading;
  const setError = useErrorPopup(); // action errors → pop-up, the page stays
  const actionError: string | null = null;
  const error = actionError || (projectsQ.error ? projectsQ.error.message || "Failed to load projects." : null);

  const [searchQuery, setSearchQuery] = useState("");
  // Each list filter can hold several choices (any of them matches); empty = all
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [fArea, setFArea] = useState<string[]>([]);
  const [fStation, setFStation] = useState<string[]>([]);
  const [fDept, setFDept] = useState<string[]>([]);
  const [fDivision, setFDivision] = useState<string[]>([]);
  const [fPriority, setFPriority] = useState<string[]>([]);
  const [fLead, setFLead] = useState<string[]>([]);
  const [fDueFrom, setFDueFrom] = useState("");
  const [fDueTo, setFDueTo] = useState("");
  const filtersOn = !!(searchQuery || filterStatus.length || fArea.length || fStation.length || fDept.length || fDivision.length
    || fPriority.length || fLead.length || fDueFrom || fDueTo);
  function clearFilters() {
    setSearchQuery(""); setFilterStatus([]); setFArea([]); setFStation([]); setFDept([]); setFDivision([]);
    setFPriority([]); setFLead([]); setFDueFrom(""); setFDueTo("");
  }
  // Filter lists come from the projects I can see
  const seenStations = [...new Map(projects.flatMap((p) => p.stations).map((s) => [s.id, s])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const seenAreaIds = new Set(seenStations.map((s) => s.areaId));
  const seenAreas = areas.filter((a) => seenAreaIds.has(a.id));
  const seenDivisions = [...new Map(projects.flatMap((p) => p.divisions).map((d) => [d.id, d])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const seenDeptIds = new Set(projects.flatMap((p) => p.departmentIds));
  const seenLeads = [...new Map(projects.filter((p) => p.lead).map((p) => [p.lead!.id, p.lead!])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const chipsFor = (vals: string[], set: (fn: (cur: string[]) => string[]) => void, labelOf: (v: string) => string, prefix: string) =>
    vals.map((v) => ({ key: prefix + v, label: labelOf(v), onRemove: () => set((cur) => cur.filter((x) => x !== v)) }));
  const projectChips = [
    ...chipsFor(fArea, setFArea, (v) => seenAreas.find((a) => String(a.id) === v)?.name ?? v, "a"),
    ...chipsFor(fStation, setFStation, (v) => { const st = seenStations.find((x) => String(x.id) === v); return st ? (st.code || st.name) : v; }, "s"),
    ...chipsFor(fDept, setFDept, (v) => departments.find((d) => String(d.id) === v)?.name ?? v, "d"),
    ...chipsFor(fDivision, setFDivision, (v) => v === "none" ? "No division" : seenDivisions.find((d) => String(d.id) === v)?.name ?? v, "v"),
    ...chipsFor(filterStatus, setFilterStatus, (v) => v, "t"),
    ...chipsFor(fPriority, setFPriority, (v) => `${v} priority`, "p"),
    ...chipsFor(fLead, setFLead, (v) => v === "none" ? "No lead yet" : `Lead: ${seenLeads.find((l) => String(l.id) === v)?.name ?? v}`, "l"),
  ];

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
    stationIds: [],
    divisionIds: [],
    color: "blue",
    leadId: "",
    teamUserIds: [],
  });

  const filteredProjects = projects.filter((project) => {
    if (filterStatus.length && !filterStatus.includes(project.status)) return false;
    if (fArea.length && !project.stations.some((s) => fArea.includes(String(s.areaId)))) return false;
    if (fStation.length && !project.stationIds.some((id) => fStation.includes(String(id)))) return false;
    if (fDept.length && !project.departmentIds.some((id) => fDept.includes(String(id)))) return false;
    if (fDivision.length && !((fDivision.includes("none") && project.divisionIds.length === 0)
      || project.divisionIds.some((id) => fDivision.includes(String(id))))) return false;
    if (fPriority.length && !fPriority.includes(project.priority)) return false;
    if (fLead.length && !((fLead.includes("none") && !project.leadId) || (project.leadId != null && fLead.includes(String(project.leadId))))) return false;
    const due = project.dueDate ? project.dueDate.slice(0, 10) : "";
    if (fDueFrom && (!due || due < fDueFrom)) return false;
    if (fDueTo && (!due || due > fDueTo)) return false;
    
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
      stationIds: [],
      divisionIds: [],
      color: "blue",
      leadId: "",
      teamUserIds: [],
    });
    setWizardStep(1);
    setTeamSearch("");
    setShowNew(true);
  }

  const orgProblem = projectOrgProblem(form, stations, allowedPairs);
  function canProceedToStep2() {
    return form.name.trim() !== "" && form.dueDate !== "" && !orgProblem;
  }

  function canProceedToStep3() {
    return form.leadId !== "";
  }

  // Leaders and team members: people who work at one of the project's departments at one of its stations
  function getEligibleLeaders() {
    return users.filter((u) =>
      (u.role?.permissions?.includes("task:manage") || u.role?.permissions?.includes("task:create")) && worksOnProjectOrg(u, form)
    );
  }

  function getEligibleTeamMembers() {
    if (form.departmentIds.length === 0) return [];
    return users.filter((u) => worksOnProjectOrg(u, form));
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
    if (orgProblem) {
      setError(orgProblem);
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
        stationIds: form.stationIds,
        divisionIds: form.divisionIds,
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
            className="flex items-center gap-1.5 px-3 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer"
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
      <div className="bg-white border border-border rounded-xl p-3 mb-6 flex-shrink-0 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search projects"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground"
            />
          </div>
          {filtersOn && (
            <button type="button" onClick={clearFilters} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted cursor-pointer">Clear filters</button>
          )}
          <span className="text-xs text-muted-foreground" data-testid="projects-count">Showing {filteredProjects.length} of {projects.length}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2 pt-1">
          <MultiSelect className="rlk-ms--compact" label="Filter by area" placeholder="All areas" noun="areas"
            options={seenAreas.map((a) => ({ value: String(a.id), label: a.name }))}
            values={fArea} onChange={(v) => {
              setFArea(v);
              // drop stations outside the chosen areas
              if (v.length) setFStation((cur) => cur.filter((sid) => v.includes(String(seenStations.find((st) => String(st.id) === sid)?.areaId))));
            }} />
          <MultiSelect className="rlk-ms--compact" label="Filter by station" placeholder="All stations" noun="stations"
            options={seenStations.filter((s) => !fArea.length || fArea.includes(String(s.areaId))).map((s) => ({ value: String(s.id), label: s.code || s.name, hint: s.code ? s.name : null }))}
            values={fStation} onChange={setFStation} />
          <MultiSelect className="rlk-ms--compact" label="Filter by department" placeholder="All departments" noun="departments"
            options={departments.filter((d) => seenDeptIds.has(d.id)).map((d) => ({ value: String(d.id), label: d.name }))}
            values={fDept} onChange={setFDept} />
          <MultiSelect className="rlk-ms--compact" label="Filter by division" placeholder="All divisions" noun="divisions"
            options={[{ value: "none", label: "No division" }, ...seenDivisions.map((d) => ({ value: String(d.id), label: d.name }))]}
            values={fDivision} onChange={setFDivision} />
          <MultiSelect className="rlk-ms--compact" label="Filter by status" placeholder="All statuses" noun="statuses"
            options={PROJECT_STATUSES.map((st) => ({ value: st, label: st }))}
            values={filterStatus} onChange={setFilterStatus} />
          <MultiSelect className="rlk-ms--compact" label="Filter by priority" placeholder="All priorities" noun="priorities"
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            values={fPriority} onChange={setFPriority} />
          <MultiSelect className="rlk-ms--compact" label="Filter by lead" placeholder="All leads" noun="leads"
            options={[{ value: "none", label: "No lead yet" }, ...seenLeads.map((l) => ({ value: String(l.id), label: l.name }))]}
            values={fLead} onChange={setFLead} />
          <label className="relative flex flex-col">
            <span className="absolute -top-2 left-2 px-1 bg-white text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due from</span>
            <input type="date" aria-label="Due from" value={fDueFrom} onChange={(e) => setFDueFrom(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground" />
          </label>
          <label className="relative flex flex-col">
            <span className="absolute -top-2 left-2 px-1 bg-white text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due to</span>
            <input type="date" aria-label="Due to" value={fDueTo} onChange={(e) => setFDueTo(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 text-foreground" />
          </label>
        </div>
        <FilterChips chips={projectChips} />
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {filteredProjects.map((project) => {
          // Counts come with each project from the server (no task download needed)
          const totalTasks = project.taskCount;
          const doneTasks = project.doneTaskCount;
          const hasTasks = totalTasks > 0;
          const progressPercent = hasTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
          
          const teamMembers = project.teamMembers || [];
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
                
                <h3 className="text-base font-semibold text-foreground mt-2 mb-1">
                  {project.name}
                </h3>
                <div className="flex flex-wrap gap-1 mb-3" data-testid="project-org-tags">
                  {project.stations.map((st) => (
                    <span key={st.id} className="px-1.5 py-0.5 rounded bg-[#15171C] text-[#E8D9B0] text-[11px] font-semibold">{st.code || st.name}</span>
                  ))}
                  {project.divisions.map((dv) => (
                    <span key={dv.id} className="px-1.5 py-0.5 rounded border border-border text-[11px] text-muted-foreground">{dv.name}</span>
                  ))}
                </div>
                
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
        <Dlg title="New Project" onClose={() => setShowNew(false)} size="lg">
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
              <ProjectOrgPicker
                areas={areas}
                stations={stations}
                divisions={divisions}
                value={form}
                onChange={(v) => setForm((f) => {
                  // team and lead must still work at the project's stations/departments
                  const keep = (id: number) => { const u = users.find((x) => x.id === id); return !!u && worksOnProjectOrg(u, v); };
                  return { ...f, ...v, teamUserIds: f.teamUserIds.filter(keep), leadId: f.leadId && keep(Number(f.leadId)) ? f.leadId : "" };
                })}
                allowedPairs={allowedPairs}
              />
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
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Stations</span>
                  <p className="text-sm text-foreground mt-1">{stations.filter((st) => form.stationIds.includes(st.id)).map((st) => st.name).join(", ") || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Divisions</span>
                  <p className="text-sm text-foreground mt-1">{divisions.filter((d) => form.divisionIds.includes(d.id)).map((d) => d.name).join(", ") || "None"}</p>
                </div>
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
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  onClick={saveNew}
                  className="px-4 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer"
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
