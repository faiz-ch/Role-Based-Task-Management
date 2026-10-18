import React from "react";
import { Department } from "../types";

/**
 * "Departments this user manages" + "All Departments" toggle.
 * Department scope lives on the USER (manage_all_departments / managed_departments).
 * `canGrantAll` should be true only if the CURRENT user manages all departments —
 * the backend rejects the toggle from anyone else.
 */
export function DepartmentScopePicker({
  departments,
  manageAll,
  selectedIds,
  onChange,
  canGrantAll,
}: {
  departments: Department[];
  manageAll: boolean;
  selectedIds: number[];
  onChange: (value: { manageAll: boolean; ids: number[] }) => void;
  canGrantAll: boolean;
}) {
  function toggle(id: number) {
    const ids = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange({ manageAll, ids });
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        Departments this user manages
      </label>
      <p className="text-xs text-muted-foreground mb-2">
        Controls which departments' users, projects and tasks this person can see and manage.
      </p>
      <div className="space-y-2">
        {canGrantAll && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={manageAll}
              onChange={(e) => onChange({ manageAll: e.target.checked, ids: e.target.checked ? [] : selectedIds })}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-foreground">All Departments</span>
          </label>
        )}
        {!manageAll &&
          (departments.length > 0 ? (
            <div className="border border-border rounded-lg p-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {departments.map((dept) => (
                <label key={dept.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(dept.id)}
                    onChange={() => toggle(dept.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-foreground">{dept.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No departments available</p>
          ))}
      </div>
    </div>
  );
}
