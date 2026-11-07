import type { Area, Station, UserType } from "../types";
import { managesAllDepartments } from "./roleAccess";

/** What a user manages: whole areas, whole stations, single departments (or everything). */
export interface ScopeValue {
  manageAll: boolean;
  areaIds: number[];
  stationIds: number[];
  departmentIds: number[];
}

export const EMPTY_SCOPE: ScopeValue = { manageAll: false, areaIds: [], stationIds: [], departmentIds: [] };

export function scopeOf(user: UserType | null | undefined): ScopeValue {
  if (!user) return EMPTY_SCOPE;
  return {
    manageAll: user.manageAllDepartments,
    areaIds: user.managedAreas.map((a) => a.id),
    stationIds: user.managedStations.map((s) => s.id),
    departmentIds: user.managedDepartments.map((d) => d.id),
  };
}

/**
 * Department ids covered by a scope, same rule as the server:
 * a whole area covers every station in it, a whole station every department at it.
 */
export function effectiveDepartmentIds(scope: ScopeValue, stations: Station[]): number[] {
  const ids = new Set(scope.departmentIds);
  const areaSet = new Set(scope.areaIds);
  const stationSet = new Set(scope.stationIds);
  for (const st of stations) {
    if (areaSet.has(st.area.id) || stationSet.has(st.id)) st.departments.forEach((d) => ids.add(d.id));
  }
  return [...ids];
}

/** What the signed-in person may hand out (null = everything). Mirrors the server's no-escalation rule. */
export interface Grantable {
  all: boolean;
  areaIds: Set<number>;
  stationIds: Set<number>;
  departmentIds: Set<number>;
}

export function grantableFor(me: UserType | null | undefined, stations: Station[]): Grantable {
  if (managesAllDepartments(me)) return { all: true, areaIds: new Set(), stationIds: new Set(), departmentIds: new Set() };
  const mine = scopeOf(me);
  const areaIds = new Set(mine.areaIds);
  const stationIds = new Set(mine.stationIds);
  stations.forEach((st) => { if (areaIds.has(st.area.id)) stationIds.add(st.id); });
  const departmentIds = new Set([...effectiveDepartmentIds(mine, stations), ...(me?.scopeDepartmentIds ?? [])]);
  return { all: false, areaIds, stationIds, departmentIds };
}

export const canGiveArea = (g: Grantable, id: number) => g.all || g.areaIds.has(id);
export const canGiveStation = (g: Grantable, id: number) => g.all || g.stationIds.has(id);
export const canGiveDepartment = (g: Grantable, id: number) => g.all || g.departmentIds.has(id);

/** Remove ticks already covered by a wider tick (the server does the same). */
export function normaliseScope(scope: ScopeValue, stations: Station[]): ScopeValue {
  if (scope.manageAll) return { ...EMPTY_SCOPE, manageAll: true };
  const areaSet = new Set(scope.areaIds);
  const stationIds = scope.stationIds.filter((id) => {
    const st = stations.find((s) => s.id === id);
    return !st || !areaSet.has(st.area.id);
  });
  const covered = new Set(effectiveDepartmentIds({ ...scope, stationIds, departmentIds: [] }, stations));
  return { manageAll: false, areaIds: scope.areaIds, stationIds, departmentIds: scope.departmentIds.filter((d) => !covered.has(d)) };
}

/** Short text such as "2 areas, 1 station, 3 departments". */
export function describeScope(user: UserType): string {
  if (managesAllDepartments(user)) return "Everything";
  const parts = [
    ...user.managedAreas.map((a) => `${a.name} (whole area)`),
    ...user.managedStations.map((s) => `${s.name} (whole station)`),
    ...user.managedDepartments.map((d) => d.name),
  ];
  return parts.length ? parts.join(", ") : "Nothing";
}

export type { Area, Station };
