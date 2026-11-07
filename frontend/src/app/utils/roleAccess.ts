import type { UserType, Department, Role } from "../types";

/**
 * Permissions whose reach is limited by "Departments this user manages".
 * MUST match SCOPE_PERMISSIONS in backend/app/routers/users.py.
 * A role with none of these gets nothing from a department scope, so the
 * user form hides that section for it.
 */
export const SCOPE_PERMISSIONS = ["project:view", "project:manage", "user:view", "user:manage"];

/** Show "Departments this user manages" only for roles that use it. */
export function roleNeedsDepartments(role: Pick<Role, "permissions"> | null | undefined): boolean {
  return !!role && role.permissions.some((p) => SCOPE_PERMISSIONS.includes(p));
}

/** Show "Extra roles this user can assign" only for roles that can create users. */
export function roleCanManageUsers(role: Pick<Role, "permissions"> | null | undefined): boolean {
  return !!role && role.permissions.includes("user:manage");
}

/** True if a role can be used by someone managing these departments (untagged roles always fit). */
export function roleFitsDepartments(
  role: Pick<Role, "departmentTag">,
  manageAll: boolean,
  departmentIds: number[]
): boolean {
  return manageAll || !role.departmentTag || departmentIds.includes(role.departmentTag.id);
}

/** Keep only roles that are general or tagged to one of the ticked departments. */
export function filterRolesByDepartments<T extends Pick<Role, "departmentTag">>(
  roles: T[],
  manageAll: boolean,
  departmentIds: number[]
): T[] {
  return roles.filter((r) => roleFitsDepartments(r, manageAll, departmentIds));
}

/**
 * After the ticked departments change: drop selected extra roles that no
 * longer fit, and return their names so the form can tell the person.
 */
export function pruneExtraRoles(
  selectedIds: number[],
  candidates: Pick<Role, "id" | "name" | "departmentTag">[],
  manageAll: boolean,
  departmentIds: number[]
): { kept: number[]; removedNames: string[] } {
  const kept: number[] = [];
  const removedNames: string[] = [];
  for (const id of selectedIds) {
    const role = candidates.find((r) => r.id === id);
    if (!role || roleFitsDepartments(role, manageAll, departmentIds)) kept.push(id);
    else removedNames.push(role.name);
  }
  return { kept, removedNames };
}

/**
 * Department scope now lives on the USER, not the role:
 *   user.manageAllDepartments === true  -> every department
 *   otherwise                           -> user.managedDepartments
 *
 * `allDepartments` is the department list the page already loaded
 * (GET /departments is itself scoped by the backend).
 */
/** The main Admin (built-in Admin role) always covers everything, like on the server. */
export function isMainAdmin(user: UserType | null | undefined): boolean {
  return !!user?.role?.isSystem;
}

export function managesAllDepartments(user: UserType | null | undefined): boolean {
  return !!user?.manageAllDepartments || isMainAdmin(user);
}

export function getEffectiveDepartmentIds(user: UserType | null | undefined, allDepartments: Department[]): number[] {
  if (!user) return [];
  return managesAllDepartments(user)
    ? allDepartments.map((d) => d.id)
    : user.scopeDepartmentIds;
}

/**
 * True if the project is inside what the user manages. Station-aware (Phase 3):
 * one of the project's departments, at one of its stations, must be managed.
 */
export function inDepartmentScope(
  user: UserType | null | undefined,
  project: { stationIds: number[]; departmentIds: number[] } | null | undefined
): boolean {
  if (!user || !project) return false;
  if (managesAllDepartments(user)) return true;
  const mine = new Set(user.scopePairs);
  return project.stationIds.some((s) => project.departmentIds.some((d) => mine.has(`${s}:${d}`)));
}
