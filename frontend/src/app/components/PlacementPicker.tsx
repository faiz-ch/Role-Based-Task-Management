import React from "react";
import type { Area, Station, Division } from "../types";

export interface PlacementValue {
  areaId: number | null;
  stationId: number | null;
  departmentId: number | null;
  divisionId: number | null;
}

export const EMPTY_PLACEMENT: PlacementValue = { areaId: null, stationId: null, departmentId: null, divisionId: null };

const selCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground disabled:bg-muted/40 disabled:text-muted-foreground";
const lblCls = "block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5";

/**
 * Where the person works: Area → Station (in that area) → Department (at that station), plus Division.
 * `allowedDepartmentIds` (optional) limits the choice to departments the signed-in person manages.
 */
export function PlacementPicker({
  areas,
  stations,
  divisions,
  value,
  onChange,
  allowedDepartmentIds,
  required = true,
}: {
  areas: Area[];
  stations: Station[];
  divisions: Division[];
  value: PlacementValue;
  onChange: (v: PlacementValue) => void;
  allowedDepartmentIds?: number[] | null;
  required?: boolean;
}) {
  const allowed = allowedDepartmentIds ? new Set(allowedDepartmentIds) : null;
  const deptsOf = (st: Station) => st.departments.filter((d) => !allowed || allowed.has(d.id));
  const usableStations = stations.filter((st) => deptsOf(st).length > 0);
  const areaOptions = areas.filter((a) => usableStations.some((st) => st.area.id === a.id));
  const stationOptions = usableStations.filter((st) => st.area.id === value.areaId);
  const station = stations.find((st) => st.id === value.stationId) || null;
  const deptOptions = station ? deptsOf(station) : [];
  const star = required ? <span className="text-red-500"> *</span> : null;

  return (
    <fieldset className="border border-border rounded-xl p-4 space-y-3">
      <legend className="px-1 text-xs font-bold text-foreground uppercase tracking-wider">Where this person works</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pl-area" className={lblCls}>Area{star}</label>
          <select
            id="pl-area"
            className={selCls}
            value={value.areaId ?? ""}
            onChange={(e) => onChange({ ...value, areaId: e.target.value ? Number(e.target.value) : null, stationId: null, departmentId: null })}
          >
            <option value="">Select area</option>
            {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pl-station" className={lblCls}>Station{star}</label>
          <select
            id="pl-station"
            className={selCls}
            disabled={!value.areaId}
            value={value.stationId ?? ""}
            onChange={(e) => onChange({ ...value, stationId: e.target.value ? Number(e.target.value) : null, departmentId: null })}
          >
            <option value="">{value.areaId ? "Select station" : "Choose an area first"}</option>
            {stationOptions.map((st) => <option key={st.id} value={st.id}>{st.name}{st.code ? ` (${st.code})` : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pl-dept" className={lblCls}>Department{star}</label>
          <select
            id="pl-dept"
            className={selCls}
            disabled={!value.stationId}
            value={value.departmentId ?? ""}
            onChange={(e) => onChange({ ...value, departmentId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{value.stationId ? "Select department" : "Choose a station first"}</option>
            {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pl-division" className={lblCls}>Division</label>
          <select
            id="pl-division"
            className={selCls}
            value={value.divisionId ?? ""}
            onChange={(e) => onChange({ ...value, divisionId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">No division</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      {areaOptions.length === 0 && (
        <p className="text-xs text-amber-700">
          No stations with departments yet. Add them on the Organization page first.
        </p>
      )}
    </fieldset>
  );
}

export function placementComplete(v: PlacementValue): boolean {
  return v.areaId != null && v.stationId != null && v.departmentId != null;
}
