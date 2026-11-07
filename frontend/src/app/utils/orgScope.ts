import type { Area, Station, UserType, Project } from "../types";
import { managesAllDepartments } from "./roleAccess";

/**
 * What a user manages: whole areas, whole stations, and single departments AT a
 * station ("stationId:departmentId"), or everything. Same rules as the server:
 * "HR at RLMC" does not cover "HR at AMTH".
 */
export interface ScopeValue {
  manageAll: boolean;
  areaIds: number[];
  stationIds: number[];
  pairs: string[];
}

export const EMPTY_SCOPE: ScopeValue = { manageAll: false, areaIds: [], stationIds: [], pairs: [] };

export const pairKey = (stationId: number, departmentId: number) => `${stationId}:${departmentId}`;
export const pairDept = (key: string) => Number(key.split(":")[1]);

export function scopeOf(user: UserType | null | undefined): ScopeValue {
  if (!user) return EMPTY_SCOPE;
  return {
    manageAll: user.manageAllDepartments,
    areaIds: user.managedAreas.map((a) => a.id),
    stationIds: user.managedStations.map((s) => s.id),
    pairs: user.managedPairs.map((p) => pairKey(p.station.id, p.department.id)),
  };
}

/** Every department-at-station a scope covers. */
export function effectivePairs(scope: ScopeValue, stations: Station[]): string[] {
  const out = new Set(scope.pairs);
  const areaSet = new Set(scope.areaIds);
  const stationSet = new Set(scope.stationIds);
  for (const st of stations) {
    if (areaSet.has(st.area.id) || stationSet.has(st.id)) st.departments.forEach((d) => out.add(pairKey(st.id, d.id)));
  }
  return [...out];
}

/** Departments appearing in a scope (for role tags, which are per department). */
export function effectiveDepartmentIds(scope: ScopeValue, stations: Station[]): number[] {
  return [...new Set(effectivePairs(scope, stations).map(pairDept))];
}

/** What the signed-in person may hand out. Mirrors the server's no-escalation rule. */
export interface Grantable {
  all: boolean;
  areaIds: Set<number>;
  stationIds: Set<number>;
  pairs: Set<string>;
}

export function grantableFor(me: UserType | null | undefined, stations: Station[]): Grantable {
  if (managesAllDepartments(me)) return { all: true, areaIds: new Set(), stationIds: new Set(), pairs: new Set() };
  const mine = scopeOf(me);
  const areaIds = new Set(mine.areaIds);
  const stationIds = new Set(mine.stationIds);
  stations.forEach((st) => { if (areaIds.has(st.area.id)) stationIds.add(st.id); });
  const pairs = new Set([...effectivePairs(mine, stations), ...(me?.scopePairs ?? [])]);
  return { all: false, areaIds, stationIds, pairs };
}

export const canGiveArea = (g: Grantable, id: number) => g.all || g.areaIds.has(id);
export const canGiveStation = (g: Grantable, id: number) => g.all || g.stationIds.has(id);
export const canGivePair = (g: Grantable, stationId: number, departmentId: number) => g.all || g.pairs.has(pairKey(stationId, departmentId));

/** Remove ticks already covered by a wider tick (the server does the same). */
export function normaliseScope(scope: ScopeValue, stations: Station[]): ScopeValue {
  if (scope.manageAll) return { ...EMPTY_SCOPE, manageAll: true };
  const areaSet = new Set(scope.areaIds);
  const stationIds = scope.stationIds.filter((id) => {
    const st = stations.find((s) => s.id === id);
    return !st || !areaSet.has(st.area.id);
  });
  const covered = new Set(effectivePairs({ ...scope, stationIds, pairs: [] }, stations));
  return { manageAll: false, areaIds: scope.areaIds, stationIds, pairs: scope.pairs.filter((p) => !covered.has(p)) };
}

/** Short text such as "Area One (whole area), RLMC (whole station), HR at AMTH". */
export function describeScope(user: UserType): string {
  if (managesAllDepartments(user)) return "Everything";
  const parts = [
    ...user.managedAreas.map((a) => `${a.name} (whole area)`),
    ...user.managedStations.map((s) => `${s.name} (whole station)`),
    ...user.managedPairs.map((p) => `${p.department.name} at ${p.station.code || p.station.name}`),
  ];
  return parts.length ? parts.join(", ") : "Nothing";
}

/** Station-aware: is one of the project's departments, at one of its stations, something the user manages? */
export function projectInScope(user: UserType | null | undefined, project: Pick<Project, "stationIds" | "departmentIds"> | null | undefined): boolean {
  if (!user || !project) return false;
  if (managesAllDepartments(user)) return true;
  const mine = new Set(user.scopePairs);
  return project.stationIds.some((s) => project.departmentIds.some((d) => mine.has(pairKey(s, d))));
}

export type { Area, Station };
