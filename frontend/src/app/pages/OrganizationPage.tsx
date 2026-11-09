import React, { useState } from "react";
import { useSearchParams, Link } from "react-router";
import { Plus, Pencil, Trash2, Search, MapPin, Building, Layers, Network } from "lucide-react";
import { Area, Station, Division } from "../types";
import { useCachedQuery, qk, FRESH, EMPTY } from "../api/queries";
import { getAreas, deleteArea, getStations, deleteStation, getDivisions, deleteDivision } from "../api/organization";
import { AreaDialog, StationDialog, DivisionDialog, ConfirmDelete, orgPrimaryBtn as primaryBtn } from "../components/OrgDialogs";
import { notifyError, notifySuccess } from "../utils/notify";
import { DepartmentsPage } from "./DepartmentsPage";

/**
 * Organization: Areas → Stations ↔ Departments, plus Divisions.
 *   Area     1 ── * Station     (each station belongs to one area)
 *   Station  * ── * Department  (a department can serve several stations)
 *   Division independent        (set on users and projects)
 */

type Tab = "areas" | "stations" | "departments" | "divisions";
const TABS: { id: Tab; label: string; Icon: React.ElementType; hint: string }[] = [
  { id: "areas", label: "Areas", Icon: MapPin, hint: "Top level, e.g. RLK Associates Pvt Limited" },
  { id: "stations", label: "Stations", Icon: Building, hint: "Each station belongs to one area" },
  { id: "departments", label: "Departments", Icon: Network, hint: "A department can serve several stations" },
  { id: "divisions", label: "Divisions", Icon: Layers, hint: "Independent, e.g. Campus 1 / Campus 2" },
];

export function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Inactive
    </span>
  );
}

function Chips({ items, empty = "—", max = 4 }: { items: { id: number; name: string; code?: string | null }[]; empty?: string; max?: number }) {
  if (items.length === 0) return <span className="text-sm text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map((i) => (
        <span key={i.id} className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200" title={i.name}>
          {i.code || i.name}
        </span>
      ))}
      {items.length > max && <span className="px-2 py-0.5 text-xs text-muted-foreground">+{items.length - max} more</span>}
    </div>
  );
}

function Toolbar({ search, setSearch, placeholder, children, onNew, newLabel }: {
  search: string; setSearch: (v: string) => void; placeholder: string; children?: React.ReactNode; onNew: () => void; newLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input aria-label={placeholder} placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 max-w-full" />
        </div>
        {children}
      </div>
      <button onClick={onNew} className={primaryBtn}><Plus size={16} /> {newLabel}</button>
    </div>
  );
}

function NameLink({ to, name }: { to: string; name: string }) {
  return <Link to={to} className="font-semibold text-foreground hover:text-blue-600 hover:underline">{name}</Link>;
}

const th = "px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider";
const td = "px-5 py-3.5 text-sm text-foreground";

function RowActions({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button onClick={onEdit} aria-label={`Edit ${label}`} title="Edit" className="p-2 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"><Pencil size={14} /></button>
      <button onClick={onDelete} aria-label={`Delete ${label}`} title="Delete" className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"><Trash2 size={14} /></button>
    </div>
  );
}

// ============================================================================ Areas
function AreasTab() {
  const areasQ = useCachedQuery<Area[]>(qk.areas, getAreas, EMPTY, { staleTime: FRESH.RARE });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Area | null>(null);

  async function remove() {
    if (!toDelete) return;
    try { await deleteArea(toDelete.id); notifySuccess("Area deleted"); }
    catch (e: any) { notifyError(e?.message || "Could not delete the area."); }
    finally { setToDelete(null); }
  }

  const rows = areasQ.data.filter((a) => `${a.name} ${a.code ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rlk-panel" style={{ overflow: "hidden" }}>
      <Toolbar search={search} setSearch={setSearch} placeholder="Search areas…" onNew={() => setEditing("new")} newLabel="New Area" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-muted/30 border-b border-border">
            <th className={th}>Area</th><th className={th}>Code</th><th className={th}>Stations</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {areasQ.isLoading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">{search ? "No areas match your search." : "No areas yet. Create the first one."}</td></tr>
              : rows.map((a) => (
                <tr key={a.id} className="hover:bg-muted/40">
                  <td className={td}><NameLink to={`/organization/areas/${a.id}`} name={a.name} />{a.description && <span className="block text-xs text-muted-foreground">{a.description}</span>}</td>
                  <td className={td}>{a.code || "—"}</td>
                  <td className={td}><Chips items={a.stations} empty="No stations" /></td>
                  <td className={td}><StatusPill active={a.isActive} /></td>
                  <td className={td}><RowActions label={a.name} onEdit={() => setEditing(a)} onDelete={() => setToDelete(a)} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && <AreaDialog editing={editing} onClose={() => setEditing(null)} />}
      {toDelete && <ConfirmDelete what="area" name={toDelete.name} onCancel={() => setToDelete(null)} onConfirm={remove} />}
    </div>
  );
}

// ============================================================================ Stations
function StationsTab() {
  const stationsQ = useCachedQuery<Station[]>(qk.stations, () => getStations(), EMPTY, { staleTime: FRESH.RARE });
  const areasQ = useCachedQuery<Area[]>(qk.areas, getAreas, EMPTY, { staleTime: FRESH.RARE });
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<number | "">("");
  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Station | null>(null);

  async function remove() {
    if (!toDelete) return;
    try { await deleteStation(toDelete.id); notifySuccess("Station deleted"); }
    catch (e: any) { notifyError(e?.message || "Could not delete the station."); }
    finally { setToDelete(null); }
  }

  const rows = stationsQ.data.filter((s) =>
    (areaFilter === "" || s.area.id === areaFilter) &&
    `${s.name} ${s.code ?? ""} ${s.area.name}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rlk-panel" style={{ overflow: "hidden" }}>
      <Toolbar search={search} setSearch={setSearch} placeholder="Search stations…" onNew={() => setEditing("new")} newLabel="New Station">
        <select aria-label="Filter by area" className="px-3 py-2 text-sm border border-border rounded-lg bg-white" value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All areas</option>
          {areasQ.data.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Toolbar>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-muted/30 border-b border-border">
            <th className={th}>Station</th><th className={th}>Code</th><th className={th}>Area</th><th className={th}>Departments</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {stationsQ.isLoading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                {areasQ.data.length === 0 ? "Create an area first, then add its stations." : search || areaFilter !== "" ? "No stations match." : "No stations yet. Create the first one."}</td></tr>
              : rows.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40">
                  <td className={td}><NameLink to={`/organization/stations/${s.id}`} name={s.name} />{s.description && <span className="block text-xs text-muted-foreground">{s.description}</span>}</td>
                  <td className={td}>{s.code || "—"}</td>
                  <td className={td}><Link to={`/organization/areas/${s.area.id}`} className="hover:text-blue-600 hover:underline">{s.area.name}</Link></td>
                  <td className={td}><span className="text-sm">{s.departments.length}</span>{s.departments.length > 0 && <span className="block text-xs text-muted-foreground truncate max-w-[260px]" title={s.departments.map((d) => d.name).join(", ")}>{s.departments.map((d) => d.name).join(", ")}</span>}</td>
                  <td className={td}><StatusPill active={s.isActive} /></td>
                  <td className={td}><RowActions label={s.name} onEdit={() => setEditing(s)} onDelete={() => setToDelete(s)} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && <StationDialog editing={editing} defaultAreaId={areaFilter} onClose={() => setEditing(null)} />}
      {toDelete && <ConfirmDelete what="station" name={toDelete.name} onCancel={() => setToDelete(null)} onConfirm={remove} />}
    </div>
  );
}

// ============================================================================ Divisions
function DivisionsTab() {
  const divQ = useCachedQuery<Division[]>(qk.divisions, getDivisions, EMPTY, { staleTime: FRESH.RARE });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Division | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Division | null>(null);

  async function remove() {
    if (!toDelete) return;
    try { await deleteDivision(toDelete.id); notifySuccess("Division deleted"); }
    catch (e: any) { notifyError(e?.message || "Could not delete the division."); }
    finally { setToDelete(null); }
  }

  const rows = divQ.data.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rlk-panel" style={{ overflow: "hidden" }}>
      <Toolbar search={search} setSearch={setSearch} placeholder="Search divisions…" onNew={() => setEditing("new")} newLabel="New Division" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-muted/30 border-b border-border">
            <th className={th}>Division</th><th className={th}>Description</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {divQ.isLoading ? <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">{search ? "No divisions match." : "No divisions yet, e.g. Campus 1 and Campus 2."}</td></tr>
              : rows.map((d) => (
                <tr key={d.id} className="hover:bg-muted/40">
                  <td className={td}><NameLink to={`/organization/divisions/${d.id}`} name={d.name} /></td>
                  <td className={td}>{d.description || "—"}</td>
                  <td className={td}><StatusPill active={d.isActive} /></td>
                  <td className={td}><RowActions label={d.name} onEdit={() => setEditing(d)} onDelete={() => setToDelete(d)} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && <DivisionDialog editing={editing} onClose={() => setEditing(null)} />}
      {toDelete && <ConfirmDelete what="division" name={toDelete.name} onCancel={() => setToDelete(null)} onConfirm={remove} />}
    </div>
  );
}

// ============================================================================ Page
export function OrganizationPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "areas") as Tab;
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="rlk-dash" style={{ maxWidth: 1240 }}>
      <div className="rlk-dash__head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="rlk-eyebrow">Rashid Latif Khan Group</span>
          <h1 className="rlk-dash__title">Organization</h1>
          <p className="rlk-dash__sub">Areas, stations, departments and divisions</p>
        </div>
      </div>

      <div className="rlk-orgtabs" role="tablist" aria-label="Organization sections">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} className="rlk-orgtab"
            onClick={() => setParams(id === "areas" ? {} : { tab: id }, { replace: true })}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{current.hint}</p>

      <div role="tabpanel">
        {tab === "areas" && <AreasTab />}
        {tab === "stations" && <StationsTab />}
        {tab === "departments" && <DepartmentsPage embedded />}
        {tab === "divisions" && <DivisionsTab />}
      </div>
    </div>
  );
}
