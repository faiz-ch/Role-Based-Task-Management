import type { Role, Department } from "../types";

/**
 * Returns the effective department IDs for a role.
 * If the role has allDepartments === true, returns all department IDs.
 * Otherwise, returns the role's assigned department IDs.
 */
export function getEffectiveDepartmentIds(role: Role | null | undefined, allDepartments: Department[]): number[] {
  if (!role) return [];
  return role?.allDepartments ? allDepartments.map((d) => d.id) : (role?.departments ?? []).map((d) => d.id);
}

/**
 * Returns the effective assignable roles for a role.
 * If the role has allRoles === true, returns all roles except the current role.
 * Otherwise, returns the role's assigned assignable roles.
 */
export function getEffectiveAssignableRoles(role: Role | null | undefined, allRoles: Role[]): Role[] {
  if (!role) return [];
  return role?.allRoles ? allRoles.filter((r) => r.id !== role.id) : (role?.assignableRoles ?? []);
}
