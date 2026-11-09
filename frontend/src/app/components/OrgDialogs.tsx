import React, { useState } from "react";
import { Area, Station, Division, Department } from "../types";
import { useCachedQuery, qk, FRESH, EMPTY } from "../api/queries";
import { getAreas, createArea, updateArea, createStation, updateStation, createDivision, updateDivision } from "../api/organization";
import { getDepartments } from "../api/departments";
import { Dlg } from "./Dlg";
import { MultiCheck } from "./MultiCheck";
import { notifyError, notifySuccess } from "../utils/notify";

/**
 * Create / edit dialogs for Areas, Stations and Divisions.
 * Used by the Organization page and by the Area / Station / Division detail pages.
 */

export const orgInputCls =
  "px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground w-full";
const labelCls = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";
export const orgPrimaryBtn =
  "flex items-center gap-1.5 px-3 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer disabled:opacity-50";
export const orgGhostBtn = "px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function ActiveToggle({ id, value, onChange }: { id: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input id={id} type="checkbox" className="w-4 h-4 accent-blue-600" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-foreground">Active</span>
    </label>
  );
}

function Buttons({ onClose, onSave, saving, createLabel, isNew }: { onClose: () => void; onSave: () => void; saving: boolean; createLabel: string; isNew: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button className={orgGhostBtn} onClick={onClose}>Cancel</button>
      <button className={orgPrimaryBtn} disabled={saving} onClick={onSave}>{saving ? "Saving…" : isNew ? createLabel : "Save"}</button>
    </div>
  );
}

export function ConfirmDelete({ what, name, onCancel, onConfirm }: { what: string; name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dlg title={`Delete ${what}`} onClose={onCancel} size="sm">
      <p className="text-sm text-foreground">Delete <b>{name}</b>? This cannot be undone.</p>
      <div className="flex justify-end gap-2 pt-5">
        <button className={orgGhostBtn} onClick={onCancel}>Cancel</button>
        <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer" onClick={onConfirm}>Delete</button>
      </div>
    </Dlg>
  );
}

// ---------------------------------------------------------------- Area
export function AreaDialog({ editing, onClose }: { editing: Area | "new"; onClose: () => void }) {
  const isNew = editing === "new";
  const [form, setForm] = useState(() => isNew
    ? { name: "", code: "", description: "", isActive: true }
    : { name: editing.name, code: editing.code ?? "", description: editing.description ?? "", isActive: editing.isActive });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) return notifyError("Area name is required.");
    setSaving(true);
    try {
      const body = { name: form.name.trim(), code: form.code.trim(), description: form.description.trim(), isActive: form.isActive };
      if (isNew) await createArea(body); else await updateArea(editing.id, body);
      notifySuccess(isNew ? "Area created" : "Area saved");
      onClose();
    } catch (e: any) { notifyError(e?.message || "Could not save the area."); }
    finally { setSaving(false); }
  }

  return (
    <Dlg title={isNew ? "New Area" : `Edit ${editing.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field id="area-name" label="Area name"><input id="area-name" className={orgInputCls} value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. RLK Associates Pvt Limited" /></Field>
        <Field id="area-code" label="Short code (optional)"><input id="area-code" className={orgInputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. RLKA" /></Field>
        <Field id="area-desc" label="Description (optional)"><textarea id="area-desc" className={orgInputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <ActiveToggle id="area-active" value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        <Buttons onClose={onClose} onSave={save} saving={saving} createLabel="Create Area" isNew={isNew} />
      </div>
    </Dlg>
  );
}

// ---------------------------------------------------------------- Station
export function StationDialog({ editing, onClose, defaultAreaId = "" }: { editing: Station | "new"; onClose: () => void; defaultAreaId?: number | "" }) {
  const isNew = editing === "new";
  const areasQ = useCachedQuery<Area[]>(qk.areas, getAreas, EMPTY, { staleTime: FRESH.RARE });
  const deptsQ = useCachedQuery<Department[]>(qk.departments, () => getDepartments(), EMPTY, { staleTime: FRESH.RARE });
  const [form, setForm] = useState(() => isNew
    ? { name: "", code: "", description: "", areaId: defaultAreaId, departmentIds: [] as number[], isActive: true }
    : { name: editing.name, code: editing.code ?? "", description: editing.description ?? "", areaId: editing.area.id as number | "", departmentIds: editing.departments.map((d) => d.id), isActive: editing.isActive });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) return notifyError("Station name is required.");
    if (form.areaId === "") return notifyError("Choose the area this station belongs to.");
    setSaving(true);
    try {
      const body = { name: form.name.trim(), code: form.code.trim(), description: form.description.trim(), areaId: Number(form.areaId), departmentIds: form.departmentIds, isActive: form.isActive };
      if (isNew) await createStation(body); else await updateStation(editing.id, body);
      notifySuccess(isNew ? "Station created" : "Station saved");
      onClose();
    } catch (e: any) { notifyError(e?.message || "Could not save the station."); }
    finally { setSaving(false); }
  }

  return (
    <Dlg title={isNew ? "New Station" : `Edit ${editing.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="st-name" label="Station name"><input id="st-name" className={orgInputCls} value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hameed Latif Teaching Hospital" /></Field>
          <Field id="st-code" label="Short code (optional)"><input id="st-code" className={orgInputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. HLTH" /></Field>
        </div>
        <Field id="st-area" label="Area">
          <select id="st-area" className={orgInputCls} value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">Choose an area…</option>
            {areasQ.data.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <MultiCheck idPrefix="st-dept" label="Departments at this station"
          help="A department can belong to several stations, e.g. a joint department of RLMC and AMTH."
          options={deptsQ.data.map((d) => ({ id: d.id, name: d.name, hint: d.stations.filter((x) => isNew || x.id !== editing.id).map((x) => x.code || x.name).join(", ") || null }))}
          selectedIds={form.departmentIds} onChange={(ids) => setForm({ ...form, departmentIds: ids })}
          emptyText="No departments yet. Create them in the Departments tab." />
        <Field id="st-desc" label="Description (optional)"><textarea id="st-desc" className={orgInputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <ActiveToggle id="st-active" value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        <Buttons onClose={onClose} onSave={save} saving={saving} createLabel="Create Station" isNew={isNew} />
      </div>
    </Dlg>
  );
}

// ---------------------------------------------------------------- Division
export function DivisionDialog({ editing, onClose }: { editing: Division | "new"; onClose: () => void }) {
  const isNew = editing === "new";
  const [form, setForm] = useState(() => isNew
    ? { name: "", description: "", isActive: true }
    : { name: editing.name, description: editing.description ?? "", isActive: editing.isActive });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) return notifyError("Division name is required.");
    setSaving(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim(), isActive: form.isActive };
      if (isNew) await createDivision(body); else await updateDivision(editing.id, body);
      notifySuccess(isNew ? "Division created" : "Division saved");
      onClose();
    } catch (e: any) { notifyError(e?.message || "Could not save the division."); }
    finally { setSaving(false); }
  }

  return (
    <Dlg title={isNew ? "New Division" : `Edit ${editing.name}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        <Field id="div-name" label="Division name"><input id="div-name" className={orgInputCls} value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Campus 1" /></Field>
        <Field id="div-desc" label="Description (optional)"><textarea id="div-desc" className={orgInputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <ActiveToggle id="div-active" value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        <Buttons onClose={onClose} onSave={save} saving={saving} createLabel="Create Division" isNew={isNew} />
      </div>
    </Dlg>
  );
}
