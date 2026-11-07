import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Area, Station } from "../types";
import {
  ScopeValue, Grantable, canGiveArea, canGiveStation, canGiveDepartment, effectiveDepartmentIds, normaliseScope,
} from "../utils/orgScope";

/**
 * "What this person manages": Everything, or Areas → Stations → Departments.
 *   - ticking a whole Area covers all its stations, including stations added later
 *   - ticking a whole Station covers all its departments, including ones added later
 *   - otherwise tick single departments
 * Only what the signed-in person may hand out is shown (`grantable`).
 */
export function ScopeTreePicker({
  areas,
  stations,
  value,
  onChange,
  grantable,
  departments = [],
}: {
  areas: Area[];
  stations: Station[];
  /** all departments; those not linked to any station are listed at the end */
  departments?: { id: number; name: string }[];
  value: ScopeValue;
  onChange: (v: ScopeValue) => void;
  grantable: Grantable;
}) {
  const [openAreas, setOpenAreas] = useState<Set<number>>(() => new Set(
    stations.filter((st) => value.stationIds.includes(st.id) || st.departments.some((d) => value.departmentIds.includes(d.id))).map((st) => st.area.id)
  ));
  const [openStations, setOpenStations] = useState<Set<number>>(() => new Set(
    stations.filter((st) => st.departments.some((d) => value.departmentIds.includes(d.id))).map((st) => st.id)
  ));
  const toggleSet = (set: Set<number>, id: number) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };

  const areaSet = new Set(value.areaIds);
  const stationSet = new Set(value.stationIds);
  const deptSet = new Set(value.departmentIds);
  const emit = (v: ScopeValue) => onChange(normaliseScope(v, stations));

  const visibleStation = (st: Station) => canGiveStation(grantable, st.id) || st.departments.some((d) => canGiveDepartment(grantable, d.id));
  const visibleAreas = areas.filter((a) => canGiveArea(grantable, a.id) || stations.some((st) => st.area.id === a.id && visibleStation(st)));
  const covered = effectiveDepartmentIds(value, stations).length;
  const linked = new Set(uniqueDepts(stations).map((d) => d.id));
  const unlinked = departments.filter((d) => !linked.has(d.id) && canGiveDepartment(grantable, d.id));

  // Ticks given by someone with wider access: the server keeps them; show them read-only
  const lockedNames = [
    ...areas.filter((a) => areaSet.has(a.id) && !canGiveArea(grantable, a.id)).map((a) => `${a.name} (whole area)`),
    ...stations.filter((s) => stationSet.has(s.id) && !canGiveStation(grantable, s.id)).map((s) => `${s.name} (whole station)`),
    ...uniqueDepts(stations).filter((d) => deptSet.has(d.id) && !canGiveDepartment(grantable, d.id)).map((d) => d.name),
  ];

  return (
    <fieldset className="border border-border rounded-xl p-4">
      <legend className="px-1 text-xs font-bold text-foreground uppercase tracking-wider">What this person manages</legend>
      <p className="text-xs text-muted-foreground mb-3">
        Controls whose users, projects and tasks this person can see and manage. A whole area also covers stations added to it later.
      </p>

      {grantable.all && (
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            aria-label="Everything"
            checked={value.manageAll}
            onChange={(e) => emit({ ...value, manageAll: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm font-semibold text-foreground">Everything (all areas, stations and departments)</span>
        </label>
      )}

      {!value.manageAll && (
        <div className="border border-border rounded-lg divide-y divide-border max-h-80 overflow-y-auto" data-testid="scope-tree">
          {visibleAreas.length === 0 && unlinked.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing available to give.</p>}
          {visibleAreas.map((area) => {
            const areaTicked = areaSet.has(area.id);
            const open = openAreas.has(area.id);
            const areaStations = stations.filter((st) => st.area.id === area.id && (areaTicked || visibleStation(st)));
            return (
              <div key={area.id}>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <button type="button" aria-label={`${open ? "Collapse" : "Expand"} ${area.name}`} onClick={() => setOpenAreas(toggleSet(openAreas, area.id))} className="p-0.5 rounded hover:bg-muted cursor-pointer">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <span className="text-sm font-semibold text-foreground flex-1">{area.name}</span>
                  {canGiveArea(grantable, area.id) && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`Whole area ${area.name}`}
                        checked={areaTicked}
                        onChange={(e) => emit({ ...value, areaIds: e.target.checked ? [...value.areaIds, area.id] : value.areaIds.filter((x) => x !== area.id) })}
                        className="w-4 h-4 accent-blue-600"
                      />
                      Whole area
                    </label>
                  )}
                </div>
                {open && (
                  <div className="pl-7 pr-3 py-1">
                    {areaStations.length === 0 && <p className="py-1 text-xs text-muted-foreground">No stations yet.</p>}
                    {areaStations.map((st) => {
                      const stTicked = areaTicked || stationSet.has(st.id);
                      const stOpen = openStations.has(st.id);
                      const depts = st.departments.filter((d) => stTicked || canGiveDepartment(grantable, d.id));
                      return (
                        <div key={st.id} className="py-1">
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={`${stOpen ? "Collapse" : "Expand"} ${st.name}`} onClick={() => setOpenStations(toggleSet(openStations, st.id))} className="p-0.5 rounded hover:bg-muted cursor-pointer">
                              {stOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                            <span className="text-sm text-foreground flex-1">{st.name}{st.code ? <span className="text-muted-foreground"> ({st.code})</span> : null}</span>
                            {canGiveStation(grantable, st.id) && (
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  aria-label={`Whole station ${st.name}`}
                                  checked={stTicked}
                                  disabled={areaTicked}
                                  onChange={(e) => emit({ ...value, stationIds: e.target.checked ? [...value.stationIds, st.id] : value.stationIds.filter((x) => x !== st.id) })}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                {areaTicked ? "Included" : "Whole station"}
                              </label>
                            )}
                          </div>
                          {stOpen && (
                            <div className="pl-7 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {depts.length === 0 && <p className="text-xs text-muted-foreground">No departments.</p>}
                              {depts.map((d) => (
                                <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    aria-label={`Department ${d.name} at ${st.name}`}
                                    checked={stTicked || deptSet.has(d.id)}
                                    disabled={stTicked || !canGiveDepartment(grantable, d.id)}
                                    onChange={(e) => emit({ ...value, departmentIds: e.target.checked ? [...value.departmentIds, d.id] : value.departmentIds.filter((x) => x !== d.id) })}
                                    className="w-4 h-4 accent-blue-600"
                                  />
                                  <span className="text-foreground">{d.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {unlinked.length > 0 && (
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Departments not linked to a station</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {unlinked.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label={`Department ${d.name}`}
                      checked={deptSet.has(d.id)}
                      onChange={(e) => emit({ ...value, departmentIds: e.target.checked ? [...value.departmentIds, d.id] : value.departmentIds.filter((x) => x !== d.id) })}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-foreground">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2" data-testid="scope-summary">
        {value.manageAll ? "Covers everything." : `Covers ${covered} department${covered === 1 ? "" : "s"}.`}
      </p>
      {lockedNames.length > 0 && !value.manageAll && (
        <p className="text-xs text-amber-700 mt-1">
          Also manages (given by someone with wider access, kept as is): {lockedNames.join(", ")}
        </p>
      )}
    </fieldset>
  );
}

function uniqueDepts(stations: Station[]) {
  const m = new Map<number, { id: number; name: string }>();
  stations.forEach((st) => st.departments.forEach((d) => m.set(d.id, d)));
  return [...m.values()];
}
