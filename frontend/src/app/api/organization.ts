import { apiFetch } from "./client";
import { Area, Station, Division } from "../types";

/* Areas, Stations and Divisions (Departments are in api/departments.ts). */

const ref = (x: any) => ({ id: x.id, name: x.name, code: x.code ?? null });

function mapArea(a: any): Area {
  return {
    id: a.id, name: a.name, code: a.code, description: a.description, isActive: a.is_active,
    stationCount: a.station_count ?? 0, stations: (a.stations ?? []).map(ref),
  };
}
function mapStation(s: any): Station {
  return {
    id: s.id, name: s.name, code: s.code, description: s.description, isActive: s.is_active,
    area: ref(s.area), departments: (s.departments ?? []).map(ref),
  };
}
function mapDivision(d: any): Division {
  return { id: d.id, name: d.name, description: d.description, isActive: d.is_active };
}

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

// ---------- Areas
export async function getAreas(): Promise<Area[]> {
  const data = await apiFetch("/areas");
  return Array.isArray(data) ? data.map(mapArea) : [];
}
export async function createArea(input: { name: string; code?: string; description?: string; isActive?: boolean }): Promise<Area> {
  return mapArea(await apiFetch("/areas", json("POST", {
    name: input.name, code: input.code || null, description: input.description || null, is_active: input.isActive ?? true,
  })));
}
export async function updateArea(id: number, input: { name?: string; code?: string; description?: string; isActive?: boolean }): Promise<Area> {
  const p: any = {};
  if (input.name !== undefined) p.name = input.name;
  if (input.code !== undefined) p.code = input.code || null;
  if (input.description !== undefined) p.description = input.description || null;
  if (input.isActive !== undefined) p.is_active = input.isActive;
  return mapArea(await apiFetch(`/areas/${id}`, json("PATCH", p)));
}
export async function deleteArea(id: number): Promise<void> {
  await apiFetch(`/areas/${id}`, { method: "DELETE" });
}

// ---------- Stations
export async function getStations(areaId?: number): Promise<Station[]> {
  const data = await apiFetch(typeof areaId === "number" ? `/stations?area_id=${areaId}` : "/stations");
  return Array.isArray(data) ? data.map(mapStation) : [];
}
export async function createStation(input: {
  name: string; code?: string; description?: string; areaId: number; departmentIds: number[]; isActive?: boolean;
}): Promise<Station> {
  return mapStation(await apiFetch("/stations", json("POST", {
    name: input.name, code: input.code || null, description: input.description || null,
    area_id: input.areaId, department_ids: input.departmentIds, is_active: input.isActive ?? true,
  })));
}
export async function updateStation(id: number, input: {
  name?: string; code?: string; description?: string; areaId?: number; departmentIds?: number[]; isActive?: boolean;
}): Promise<Station> {
  const p: any = {};
  if (input.name !== undefined) p.name = input.name;
  if (input.code !== undefined) p.code = input.code || null;
  if (input.description !== undefined) p.description = input.description || null;
  if (input.areaId !== undefined) p.area_id = input.areaId;
  if (input.departmentIds !== undefined) p.department_ids = input.departmentIds;
  if (input.isActive !== undefined) p.is_active = input.isActive;
  return mapStation(await apiFetch(`/stations/${id}`, json("PATCH", p)));
}
export async function deleteStation(id: number): Promise<void> {
  await apiFetch(`/stations/${id}`, { method: "DELETE" });
}

// ---------- Divisions
export async function getDivisions(): Promise<Division[]> {
  const data = await apiFetch("/divisions");
  return Array.isArray(data) ? data.map(mapDivision) : [];
}
export async function createDivision(input: { name: string; description?: string; isActive?: boolean }): Promise<Division> {
  return mapDivision(await apiFetch("/divisions", json("POST", {
    name: input.name, description: input.description || null, is_active: input.isActive ?? true,
  })));
}
export async function updateDivision(id: number, input: { name?: string; description?: string; isActive?: boolean }): Promise<Division> {
  const p: any = {};
  if (input.name !== undefined) p.name = input.name;
  if (input.description !== undefined) p.description = input.description || null;
  if (input.isActive !== undefined) p.is_active = input.isActive;
  return mapDivision(await apiFetch(`/divisions/${id}`, json("PATCH", p)));
}
export async function deleteDivision(id: number): Promise<void> {
  await apiFetch(`/divisions/${id}`, { method: "DELETE" });
}
