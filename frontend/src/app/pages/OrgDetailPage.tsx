import React, { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Edit2, Trash2, Users, Building, Network, FolderKanban, MapPin, Search, AlertTriangle } from "lucide-react";
import { Area, Station, Division, UserType, Project } from "../types";
import { useCachedQuery, qk, FRESH, EMPTY } from "../api/queries";
import { getAreas, getStations, getDivisions, deleteArea, deleteStation, deleteDivision } from "../api/organization";
import { getUsers } from "../api/users";
import { getProjects } from "../api/projects";
import { AreaDialog, StationDialog, DivisionDialog, ConfirmDelete } from "../components/OrgDialogs";
import { Av } from "../components/Av";
import { StatusPill } from "./OrganizationPage";
import { notifyError, notifySuccess } from "../utils/notify";

/**
 * Detail page for an Area, a Station or a Division (Departments have their own page).
 * People and projects come from the normal lists, which the server already limits
 * to what the signed-in person may see.
 */

type Kind = "areas" | "stations" | "divisions";
const KIND_LABEL: Record<Kind, { one: string; tab: string }> = {
  areas: { one: "Area", tab: "areas" },
  stations: { one: "Station", tab: "stations" },
  divisions: { one: "Division", tab: "divisions" },
};

const th = "px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider";
const td = "px-5 py-3 text-sm text-foreground";

const PROJECT_STATUS_STYLE: Record<string, string> = {
  Planning: "bg-slate-100 text-slate-600 border-slate-200",
  Active: "bg-blue-50 text-blue-700 border-blue-200",
  "Pending Approval": "bg-amber-50 text-amber-700 border-amber-200",
  Done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Archived: "bg-slate-100 text-slate-500 border-slate-200",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Stat({ Icon, label, value }: { Icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div className="px-5 py-10 text-sm text-muted-foreground text-center">{text}</div>;

export function OrgDetailPage({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const oid = Number(id);
  const navigate = useNavigate();
  const label = KIND_LABEL[kind];

  const areasQ = useCachedQuery<Area[]>(qk.areas, getAreas, EMPTY, { staleTime: FRESH.RARE });
  const stationsQ = useCachedQuery<Station[]>(qk.stations, () => getStations(), EMPTY, { staleTime: FRESH.RARE });
  const divisionsQ = useCachedQuery<Division[]>(qk.divisions, getDivisions, EMPTY, { staleTime: FRESH.RARE });
  const usersQ = useCachedQuery<UserType[]>(qk.users, getUsers, EMPTY, { staleTime: FRESH.NORMAL });
  const projectsQ = useCachedQuery<Project[]>(qk.projects, getProjects, EMPTY, { staleTime: FRESH.LIVE });

  const [tab, setTab] = useState<string>("overview");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const area = kind === "areas" ? areasQ.data.find((a) => a.id === oid) : undefined;
  const station = kind === "stations" ? stationsQ.data.find((s) => s.id === oid) : undefined;
  const division = kind === "divisions" ? divisionsQ.data.find((d) => d.id === oid) : undefined;
  const item = area || station || division;
  const loading = kind === "areas" ? areasQ.isLoading : kind === "stations" ? stationsQ.isLoading : divisionsQ.isLoading;

  // Stations covered (area: its stations; station: itself)
  const stationList = useMemo(() => {
    if (kind === "areas") return stationsQ.data.filter((s) => s.area.id === oid);
    if (kind === "stations") return station ? [station] : [];
    return [];
  }, [kind, oid, stationsQ.data, station]);
  const stationIds = new Set(stationList.map((s) => s.id));
  const deptPairCount = stationList.reduce((n, s) => n + s.departments.length, 0);

  const people = usersQ.data.filter((u) =>
    kind === "divisions" ? u.division?.id === oid : !!u.station && stationIds.has(u.station.id));
  const projects = projectsQ.data.filter((p) =>
    kind === "divisions" ? p.divisionIds.includes(oid) : p.stationIds.some((sid) => stationIds.has(sid)));

  // Who manages it (whole area / whole station / some departments at the station)
  const managers = useMemo(() => {
    if (kind === "divisions") return [];
    const out: { user: UserType; how: string }[] = [];
    for (const u of usersQ.data) {
      if (kind === "areas") {
        if (u.managedAreas.some((a) => a.id === oid)) out.push({ user: u, how: "Whole area" });
        else {
          const sts = u.managedStations.filter((s) => s.areaId === oid).map((s) => s.code || s.name);
          const prs = u.managedPairs.filter((p) => p.station.areaId === oid);
          if (sts.length) out.push({ user: u, how: `Stations: ${sts.join(", ")}` });
          else if (prs.length) out.push({ user: u, how: `${prs.length} department${prs.length === 1 ? "" : "s"} at stations in this area` });
        }
      } else if (station) {
        if (u.managedAreas.some((a) => a.id === station.area.id)) out.push({ user: u, how: `Whole area (${station.area.name})` });
        else if (u.managedStations.some((s) => s.id === oid)) out.push({ user: u, how: "Whole station" });
        else {
          const prs = u.managedPairs.filter((p) => p.station.id === oid).map((p) => p.department.name);
          if (prs.length) out.push({ user: u, how: prs.join(", ") });
        }
      }
    }
    return out.sort((a, b) => a.user.name.localeCompare(b.user.name));
  }, [kind, oid, usersQ.data, station]);

  const q = search.trim().toLowerCase();
  const peopleShown = people.filter((u) =>
    !q || `${u.name} ${u.email} ${u.employeeCode ?? ""} ${u.department?.name ?? ""} ${u.station?.name ?? ""} ${u.role?.name ?? ""}`.toLowerCase().includes(q));
  const projectsShown = projects.filter((p) => !q || `${p.name} ${p.lead?.name ?? ""} ${p.status}`.toLowerCase().includes(q));

  async function remove() {
    try {
      if (kind === "areas") await deleteArea(oid);
      else if (kind === "stations") await deleteStation(oid);
      else await deleteDivision(oid);
      notifySuccess(`${label.one} deleted`);
      navigate(`/organization?tab=${label.tab}`);
    } catch (e: any) {
      notifyError(e?.message || `Could not delete the ${label.one.toLowerCase()}.`);
    } finally { setDeleting(false); }
  }

  if (loading && !item) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{label.one} not found.</span>
          <Link to={`/organization?tab=${label.tab}`} className="ml-auto text-red-700 underline">Back to Organization</Link>
        </div>
      </div>
    );
  }

  const code = (item as Area | Station).code ?? null;
  const tabs = [
    { id: "overview", label: "Overview" },
    ...(kind === "areas" ? [{ id: "stations", label: `Stations (${stationList.length})` }] : []),
    ...(kind !== "divisions" ? [{ id: "departments", label: `Departments (${deptPairCount})` }] : []),
    { id: "people", label: `People (${people.length})` },
    { id: "projects", label: `Projects (${projects.length})` },
  ];
  const searchBox = (placeholder: string) => (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input aria-label={placeholder} placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)}
        className="pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 max-w-full" />
    </div>
  );
  const peopleAtStation = (sid: number, did: number) => usersQ.data.filter((u) => u.station?.id === sid && u.department?.id === did).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="org-detail">
      {/* Header */}
      <div>
        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2" aria-label="Breadcrumb">
          <Link to="/organization" className="hover:text-foreground">Organization</Link><span>/</span>
          <Link to={`/organization?tab=${label.tab}`} className="hover:text-foreground">{label.one === "Area" ? "Areas" : label.one === "Station" ? "Stations" : "Divisions"}</Link><span>/</span>
          <span className="text-foreground">{item.name}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{item.name}{code && <span className="ml-2 text-base font-medium text-muted-foreground">({code})</span>}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <StatusPill active={item.isActive} />
              <span className="text-xs text-muted-foreground">{label.one}</span>
              {station && (
                <span className="text-xs text-muted-foreground">in <Link to={`/organization/areas/${station.area.id}`} className="text-blue-600 hover:underline">{station.area.name}</Link></span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg hover:bg-muted text-sm font-medium cursor-pointer">
              <Edit2 size={14} /> Edit {label.one}
            </button>
            <button onClick={() => setDeleting(true)} aria-label={`Delete ${label.one}`} className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium cursor-pointer">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {kind === "areas" && <Stat Icon={Building} label="Stations" value={stationList.length} />}
          {kind === "stations" && station && <Stat Icon={MapPin} label="Area" value={<span className="text-sm font-medium">{station.area.name}</span>} />}
          {kind !== "divisions" && <Stat Icon={Network} label="Departments (per station)" value={deptPairCount} />}
          <Stat Icon={Users} label="People" value={people.length} />
          <Stat Icon={FolderKanban} label="Projects" value={projects.length} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-6" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setSearch(""); }}
              className={`pb-3 px-1 text-sm font-medium whitespace-nowrap border-b-2 cursor-pointer ${tab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="About">
            <p className="px-5 py-4 text-sm text-foreground leading-relaxed">{item.description || "No description provided."}</p>
          </Panel>
          {kind !== "divisions" ? (
            <Panel title="Managed by">
              {managers.length === 0 ? <Empty text="Nobody is given this yet (people who manage everything also cover it)." /> : (
                <ul className="divide-y divide-border" data-testid="org-managers">
                  {managers.map(({ user, how }) => (
                    <li key={user.id} className="px-5 py-3 flex items-center gap-3">
                      <Av name={user.name} />
                      <div className="min-w-0">
                        <Link to={`/users/${user.id}`} className="text-sm font-medium text-foreground hover:text-blue-600">{user.name}</Link>
                        <p className="text-xs text-muted-foreground truncate">{user.role?.name || "No role"} · {how}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {managers.length > 0 && <p className="px-5 pb-3 text-xs text-muted-foreground">People who manage everything also cover it.</p>}
            </Panel>
          ) : (
            <Panel title="Summary">
              <div className="px-5 py-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">People in this division</span><span className="font-medium">{people.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Active projects</span><span className="font-medium">{projects.filter((p) => p.status === "Active").length}</span></div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === "stations" && kind === "areas" && (
        <Panel title="Stations in this area">
          {stationList.length === 0 ? <Empty text="No stations in this area yet." /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr className="bg-muted/30 border-b border-border"><th className={th}>Station</th><th className={th}>Code</th><th className={th}>Departments</th><th className={th}>People</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {stationList.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className={td}><Link to={`/organization/stations/${s.id}`} className="font-semibold hover:text-blue-600 hover:underline">{s.name}</Link></td>
                    <td className={td}>{s.code || "—"}</td>
                    <td className={td}>{s.departments.length}</td>
                    <td className={td}>{usersQ.data.filter((u) => u.station?.id === s.id).length}</td>
                    <td className={td}><StatusPill active={s.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Panel>
      )}

      {tab === "departments" && kind !== "divisions" && (
        <div className="space-y-4">
          {stationList.length === 0 && <Panel title="Departments"><Empty text="No stations, so no departments." /></Panel>}
          {stationList.map((s) => (
            <Panel key={s.id} title={kind === "areas" ? `${s.name}${s.code ? ` (${s.code})` : ""}` : "Departments at this station"}>
              {s.departments.length === 0 ? <Empty text="No departments at this station." /> : (
                <div className="overflow-x-auto"><table className="w-full">
                  <thead><tr className="bg-muted/30 border-b border-border"><th className={th}>Department</th><th className={th}>People here</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {[...s.departments].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                      <tr key={d.id} className="hover:bg-muted/40">
                        <td className={td}><Link to={`/departments/${d.id}`} className="hover:text-blue-600 hover:underline">{d.name}</Link></td>
                        <td className={td}>{peopleAtStation(s.id, d.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {tab === "people" && (
        <Panel title="People" right={searchBox("Search people…")}>
          {peopleShown.length === 0 ? <Empty text={q ? "Nobody matches your search." : "No people here yet."} /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr className="bg-muted/30 border-b border-border">
                <th className={th}>Code</th><th className={th}>Name</th>{kind !== "stations" && <th className={th}>Station</th>}<th className={th}>Department</th><th className={th}>Role</th><th className={th}>Status</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {peopleShown.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/40">
                    <td className={td}>{u.employeeCode || "—"}</td>
                    <td className={td}><Link to={`/users/${u.id}`} className="font-medium hover:text-blue-600 hover:underline">{u.name}</Link><span className="block text-xs text-muted-foreground">{u.email}</span></td>
                    {kind !== "stations" && <td className={td}>{u.station ? (u.station.code || u.station.name) : "—"}</td>}
                    <td className={td}>{u.department?.name || "—"}</td>
                    <td className={td}>{u.role?.name || "No role"}</td>
                    <td className={td}><StatusPill active={u.active} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border">Showing {peopleShown.length} of {people.length}. Only people within what you manage are listed.</p>
        </Panel>
      )}

      {tab === "projects" && (
        <Panel title="Projects" right={searchBox("Search projects…")}>
          {projectsShown.length === 0 ? <Empty text={q ? "No projects match your search." : "No projects here yet."} /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr className="bg-muted/30 border-b border-border">
                <th className={th}>Project</th><th className={th}>Stations</th><th className={th}>Lead</th><th className={th}>Due</th><th className={th}>Tasks done</th><th className={th}>Status</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {projectsShown.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className={td}><Link to={`/projects/${p.id}`} className="font-medium hover:text-blue-600 hover:underline">{p.name}</Link></td>
                    <td className={td}>{p.stations.map((s) => s.code || s.name).join(", ") || "—"}</td>
                    <td className={td}>{p.lead?.name || "No lead yet"}</td>
                    <td className={td}>{fmtDate(p.dueDate)}</td>
                    <td className={td}>{p.doneTaskCount}/{p.taskCount}</td>
                    <td className={td}><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${PROJECT_STATUS_STYLE[p.status] || PROJECT_STATUS_STYLE.Planning}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Panel>
      )}

      {editing && kind === "areas" && area && <AreaDialog editing={area} onClose={() => setEditing(false)} />}
      {editing && kind === "stations" && station && <StationDialog editing={station} onClose={() => setEditing(false)} />}
      {editing && kind === "divisions" && division && <DivisionDialog editing={division} onClose={() => setEditing(false)} />}
      {deleting && <ConfirmDelete what={label.one.toLowerCase()} name={item.name} onCancel={() => setDeleting(false)} onConfirm={remove} />}
    </div>
  );
}
