import type { UserType, Department } from "../types";

/**
 * Department scope now lives on the USER, not the role:
 *   user.manageAllDepartments === true  -> every department
 *   otherwise                           -> user.managedDepartments
 *
 * `allDepartments` is the department list the page already loaded
 * (GET /departments is itself scoped by the backend).
 */
export function managesAllDepartments(user: UserType | null | undefined): boolean {
  return !!user?.manageAllDepartments;
}

export function getEffectiveDepartmentIds(user: UserType | null | undefined, allDepartments: Department[]): number[] {
  if (!user) return [];
  return user.manageAllDepartments
    ? allDepartments.map((d) => d.id)
    : user.managedDepartments.map((d) => d.id);
}

/** True if the user's department scope covers at least one of the given departments. */
export function inDepartmentScope(user: UserType | null | undefined, departmentIds: number[] | undefined): boolean {
  if (!user) return false;
  if (user.manageAllDepartments) return true;
  const mine = new Set(user.managedDepartments.map((d) => d.id));
  return (departmentIds ?? []).some((id) => mine.has(id));
}
