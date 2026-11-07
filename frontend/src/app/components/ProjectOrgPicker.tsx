import React, { useEffect, useMemo, useState } from "react";
import type { Area, Station, Division } from "../types";

export interface ProjectOrgValue {
  stationIds: number[];
  departmentIds: number[];
  divisionIds: number[];
}

const box = "border border-border rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-44 overflow-y-auto";
const lbl = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";
const key = (s: number, d: number) => `${s}:${d}`;

/**
 * Where the project runs, shaped by what the signed-in person manages:
 *   - departments at one station only  → just Departments (station filled in)
 *   - several stations                 → Stations, then their Departments
 *   - stations in several areas        → Areas first, then Stations, then Departments
 * Divisions (optional, several) are always offered.
 * `allowedPairs` ("stationId:departmentId", null = everything) limits the choices.
 */
export function ProjectOrgPicker({
  areas, stations, divisions, value, onChange, allowedPairs,
}: {
  areas: Area[];
  stations: Station[];
  divisions: Division[];
  value: ProjectOrgValue;
  onChange: (v: ProjectOrgValue) => void;
  allowedPairs: string[] | null;
}) {
  const allowed = useMemo(() => (allowedPairs ? new Set(allowedPairs) : null), [allowedPairs]);
  const okPair = (s: number, d: number) => !allowed || allowed.has(key(s, d));
  const usableStations = stations.filter((st) => st.departments.some((d) => okPair(st.id, d.id)));
  const usableAreas = areas.filter((a) => usableStations.some((st) => st.area.id === a.id));
  const showAreas = usableAreas.length > 1;
  const showStations = usableStations.length > 1;

  // Areas only narrow the station list (a project stores stations; its areas follow from them)
  const [areaIds, setAreaIds] = useState<number[]>(() =>
    [...new Set(stations.filter((st) => value.stationIds.includes(st.id)).map((st) => st.area.id))]
  );

  // One possible station: choose it automatically
  useEffect(() => {
    if (usableStations.length === 1 && value.stationIds.length === 0) {
      onChange({ ...value, stationIds: [usableStations[0].id] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usableStations.length]);

  const stationChoices = showAreas ? usableStations.filter((st) => areaIds.includes(st.area.id)) : usableStations;
  const chosenStations = stations.filter((st) => value.stationIds.includes(st.id));

  // Departments available at the chosen stations (once each), with where they are
  const deptChoices = useMemo(() => {
    const m = new Map<number, { id: number; name: string; at: string[] }>();
    for (const st of chosenStations) {
      for (const d of st.departments) {
        if (!okPair(st.id, d.id)) continue;
        const e = m.get(d.id) || { id: d.id, name: d.name, at: [] };
        e.at.push(st.code || st.name);
        m.set(d.id, e);
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenStations.map((s) => s.id).join(","), allowedPairs]);

  // Combinations that exist but are not mine (e.g. HR at a second station) — the server would refuse
  const outside = allowed
    ? chosenStations.flatMap((st) => st.departments
        .filter((d) => value.departmentIds.includes(d.id) && !allowed.has(key(st.id, d.id)))
        .map((d) => `${d.name} at ${st.code || st.name}`))
    : [];

  function setStations(ids: number[]) {
    const still = new Set(stations.filter((s) => ids.includes(s.id)).flatMap((s) => s.departments.filter((d) => okPair(s.id, d.id)).map((d) => d.id)));
    onChange({ ...value, stationIds: ids, departmentIds: value.departmentIds.filter((d) => still.has(d)) });
  }
  function toggleArea(id: number) {
    const next = areaIds.includes(id) ? areaIds.filter((x) => x !== id) : [...areaIds, id];
    setAreaIds(next);
    setStations(value.stationIds.filter((sid) => next.includes(stations.find((s) => s.id === sid)?.area.id ?? -1)));
  }
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (usableStations.length === 0) {
    return <p className="text-sm text-amber-700">You don't manage any department at a station yet, so you can't place a project. Ask your administrator.</p>;
  }

  return (
    <div className="space-y-3" data-testid="project-org">
      {showAreas && (
        <div className="flex flex-col gap-1.5">
          <span className={lbl}>Areas</span>
          <div className={box}>
            {usableAreas.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5">
                <input type="checkbox" aria-label={`Area ${a.name}`} checked={areaIds.includes(a.id)} onChange={() => toggleArea(a.id)} className="w-4 h-4 accent-blue-600" />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {showStations ? (
        <div className="flex flex-col gap-1.5">
          <span className={lbl}>Stations <span className="text-red-500">*</span></span>
          <div className={box}>
            {stationChoices.length === 0 && <p className="text-xs text-muted-foreground px-1">Tick an area first.</p>}
            {stationChoices.map((st) => (
              <label key={st.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5">
                <input type="checkbox" aria-label={`Station ${st.name}`} checked={value.stationIds.includes(st.id)} onChange={() => setStations(toggle(value.stationIds, st.id))} className="w-4 h-4 accent-blue-600" />
                {st.name}{st.code ? <span className="text-muted-foreground"> ({st.code})</span> : null}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground"><span className={lbl}>Station: </span>{usableStations[0].name}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Departments <span className="text-red-500">*</span></span>
        <div className={box}>
          {deptChoices.length === 0 && <p className="text-xs text-muted-foreground px-1">{value.stationIds.length ? "No departments at the chosen stations." : "Choose a station first."}</p>}
          {deptChoices.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5">
              <input type="checkbox" aria-label={`Department ${d.name}`} checked={value.departmentIds.includes(d.id)} onChange={() => onChange({ ...value, departmentIds: toggle(value.departmentIds, d.id) })} className="w-4 h-4 accent-blue-600" />
              <span>{d.name}{showStations && <span className="text-xs text-muted-foreground"> · {d.at.join(", ")}</span>}</span>
            </label>
          ))}
        </div>
        {outside.length > 0 && (
          <p className="text-xs text-amber-700" data-testid="org-outside">
            Outside what you manage: {outside.join(", ")}. Untick that station or department.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Divisions</span>
        {divisions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No divisions yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {divisions.map((dv) => (
              <label key={dv.id} className="flex items-center gap-2 text-sm cursor-pointer px-3 py-1.5 border border-border rounded-lg">
                <input type="checkbox" aria-label={`Division ${dv.name}`} checked={value.divisionIds.includes(dv.id)} onChange={() => onChange({ ...value, divisionIds: toggle(value.divisionIds, dv.id) })} className="w-4 h-4 accent-blue-600" />
                {dv.name}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Problems to show before saving (null = fine). */
export function projectOrgProblem(v: ProjectOrgValue, stations: Station[], allowedPairs: string[] | null): string | null {
  if (v.stationIds.length === 0) return "Please select at least one station.";
  if (v.departmentIds.length === 0) return "Please select at least one department.";
  if (allowedPairs) {
    const ok = new Set(allowedPairs);
    for (const st of stations.filter((s) => v.stationIds.includes(s.id))) {
      for (const d of st.departments) {
        if (v.departmentIds.includes(d.id) && !ok.has(key(st.id, d.id))) return `${d.name} at ${st.code || st.name} is outside what you manage.`;
      }
    }
  }
  return null;
}

/** People who work at one of the project's departments at one of its stations. */
export function worksOnProjectOrg(u: { station: { id: number } | null; department: { id: number } | null }, v: Pick<ProjectOrgValue, "stationIds" | "departmentIds">) {
  return !!u.station && !!u.department && v.stationIds.includes(u.station.id) && v.departmentIds.includes(u.department.id);
}
