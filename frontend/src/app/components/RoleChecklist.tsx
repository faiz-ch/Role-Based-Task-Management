import React from "react";

/**
 * Checklist of roles with an optional "all roles" switch.
 * Used for a role's BASE assignable list (RolesPage / RoleDetailPage)
 * and for a user's personal EXTRA assignable roles (UsersPage / UserDetailPage).
 */
export function RoleChecklist({
  title,
  help,
  roles,
  selectedIds,
  onChange,
  allRoles,
  onAllRolesChange,
  emptyText = "No roles available",
}: {
  title: string;
  help?: string;
  roles: { id: number; name: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Pass these two to show the "Can assign ALL roles" switch. */
  allRoles?: boolean;
  onAllRolesChange?: (value: boolean) => void;
  emptyText?: string;
}) {
  const showAllSwitch = onAllRolesChange !== undefined;
  const locked = showAllSwitch && !!allRoles;

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{title}</label>
      {help && <p className="text-xs text-muted-foreground mb-2">{help}</p>}
      {showAllSwitch && (
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={!!allRoles}
            onChange={(e) => onAllRolesChange!(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm text-foreground">Can assign ALL roles (including roles created later)</span>
        </label>
      )}
      {!locked &&
        (roles.length > 0 ? (
          <div className="border border-border rounded-lg p-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(r.id)}
                  onChange={() => toggle(r.id)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-foreground">{r.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ))}
    </div>
  );
}
