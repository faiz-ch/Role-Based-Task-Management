import React, { useState } from "react";
import { Edit2, AlertTriangle, Plus, Trash2, Search, Eye, EyeOff, RefreshCw, Upload } from "lucide-react";
import { UserType, Role, Department, Area, Station, Division } from "../types";
import { getUsers, createUser, deleteUser, uploadAvatar } from "../api/users";
import { getRoles, getAssignableRoles } from "../api/roles";
import { useCachedQuery, qk, FRESH, EMPTY } from "../api/queries";
import { getDepartments } from "../api/departments";
import { Av } from "../components/Av";
import { Dlg } from "../components/Dlg";
import { FldInput } from "../components/FldInput";
import { FldSelect } from "../components/FldSelect";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router";
import { ScopeTreePicker } from "../components/ScopeTreePicker";
import { PlacementPicker, PlacementValue, EMPTY_PLACEMENT, placementComplete } from "../components/PlacementPicker";
import { getAreas, getStations, getDivisions } from "../api/organization";
import { ScopeValue, EMPTY_SCOPE, effectiveDepartmentIds, grantableFor } from "../utils/orgScope";
import { RoleChecklist } from "../components/RoleChecklist";
import { roleNeedsDepartments, roleCanManageUsers, filterRolesByDepartments, pruneExtraRoles, managesAllDepartments } from "../utils/roleAccess";
import { useErrorPopup } from "../utils/notify";

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function generatePassword(length: number = 12): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

export function UsersPage() {
  const { permissions, currentUser } = useAuth();
  const navigate = useNavigate();
  // Shared store: instant when already loaded, refreshed after every save
  const usersQ = useCachedQuery<UserType[]>(qk.users, getUsers, EMPTY, { staleTime: FRESH.NORMAL });
  const rolesQ = useCachedQuery<Role[]>(qk.roles, getRoles, EMPTY, { staleTime: FRESH.RARE });
  const departmentsQ = useCachedQuery<Department[]>(qk.departments, getDepartments, EMPTY, { staleTime: FRESH.RARE });
  const areasQ = useCachedQuery<Area[]>(qk.areas, getAreas, EMPTY, { staleTime: FRESH.RARE });
  const stationsQ = useCachedQuery<Station[]>(qk.stations, () => getStations(), EMPTY, { staleTime: FRESH.RARE });
  const divisionsQ = useCachedQuery<Division[]>(qk.divisions, getDivisions, EMPTY, { staleTime: FRESH.RARE });
  const areas = areasQ.data, stations = stationsQ.data, divisions = divisionsQ.data;
  // Roles the current user may hand out (GET /roles/assignable — base list + personal extras, dept-tag filtered)
  const assignableQ = useCachedQuery<Role[]>(qk.assignableRoles, getAssignableRoles, EMPTY, { staleTime: FRESH.RARE });
  const users = usersQ.data;
  const setUsers = usersQ.setData;
  const roles = rolesQ.data;
  const assignableRoles = assignableQ.data;
  const departments = departmentsQ.data;
  const loading = usersQ.isLoading;
  const setError = useErrorPopup(); // action errors → pop-up, the page stays
  const actionError: string | null = null;
  const error = actionError || (usersQ.error ? usersQ.error.message || "Failed to load users data." : null);
  
  const canManage = permissions.includes("user:manage");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterStation, setFilterStation] = useState<string>("all");
  const [filterDivision, setFilterDivision] = useState<string>("all");
  const [filterJoinedFrom, setFilterJoinedFrom] = useState("");
  const [filterJoinedTo, setFilterJoinedTo] = useState("");
  const filtersActive = [filterDepartment, filterRole, filterStatus, filterArea, filterStation, filterDivision].some((f) => f !== "all")
    || !!filterJoinedFrom || !!filterJoinedTo || !!searchQuery;
  function clearFilters() {
    setSearchQuery(""); setFilterDepartment("all"); setFilterRole("all"); setFilterStatus("all");
    setFilterArea("all"); setFilterStation("all"); setFilterDivision("all"); setFilterJoinedFrom(""); setFilterJoinedTo("");
    setCurrentPage(1);
  }

  // Selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createJoining, setCreateJoining] = useState("");
  const [createDesignation, setCreateDesignation] = useState("");
  const [createPlacement, setCreatePlacement] = useState<PlacementValue>(EMPTY_PLACEMENT);
  const [createRole, setCreateRole] = useState<string>("");
  const [createActive, setCreateActive] = useState(true);
  const [createSendWelcome, setCreateSendWelcome] = useState(true);
  const [createScope, setCreateScope] = useState<ScopeValue>(EMPTY_SCOPE);
  const createManageAll = createScope.manageAll;
  const createManagedIds = effectiveDepartmentIds(createScope, stations);
  const [createExtraRoleIds, setCreateExtraRoleIds] = useState<number[]>([]);
  const [createExtrasNote, setCreateExtrasNote] = useState<string | null>(null);
  const setCreateError = useErrorPopup(); // → pop-up
  const createError: string | null = null;
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const setAvatarUploadError = useErrorPopup(); // → pop-up
  const avatarUploadError: string | null = null;

  // Delete confirmation state
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserType | null>(null);


  // What I may hand out (whole areas / stations / departments), and where I may place people
  const grantable = grantableFor(currentUser, stations);
  const placeablePairs = managesAllDepartments(currentUser) ? null : [...grantable.pairs];

  const selectedCreateRole = assignableRoles.find((r) => r.id === Number(createRole)) || null;
  // "Departments this user manages" only for roles with a department-based permission
  const showCreateScope = roleNeedsDepartments(selectedCreateRole);
  // Extra assignable roles only if the chosen role can manage users and does not already assign every role
  const showCreateExtras = roleCanManageUsers(selectedCreateRole) && !selectedCreateRole!.allRoles;
  // Lock 1: candidates = roles I can assign, minus the chosen role and its base list
  const createExtraLockOne = selectedCreateRole
    ? assignableRoles.filter(
        (r) => r.id !== selectedCreateRole.id && !selectedCreateRole.assignableRoles.some((b) => b.id === r.id)
      )
    : [];
  // ...then only roles that fit the departments ticked above (general roles always fit)
  const createExtraCandidates = filterRolesByDepartments(createExtraLockOne, createManageAll, createManagedIds);

  function handleCreateRoleChange(value: string) {
    setCreateRole(value);
    setCreateExtrasNote(null);
    const role = assignableRoles.find((r) => r.id === Number(value)) || null;
    // Clear sections that do not apply to the new role
    if (!roleNeedsDepartments(role)) setCreateScope(EMPTY_SCOPE);
    if (!roleCanManageUsers(role)) setCreateExtraRoleIds([]);
  }

  function handleCreateScopeChange(scope: ScopeValue) {
    setCreateScope(scope);
    const manageAll = scope.manageAll;
    const ids = effectiveDepartmentIds(scope, stations);
    const { kept, removedNames } = pruneExtraRoles(createExtraRoleIds, createExtraLockOne, manageAll, ids);
    setCreateExtraRoleIds(kept);
    setCreateExtrasNote(
      removedNames.length
        ? `Removed ${removedNames.join(", ")}: its department is no longer managed by this user.`
        : null
    );
  }

  // Filter users based on search and filters
  const filteredUsers = users.filter((user) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      q === "" ||
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      (user.employeeCode ?? "").includes(q) ||
      (user.designation ?? "").toLowerCase().includes(q);
    const matchesPlace =
      (filterArea === "all" || user.area?.id === Number(filterArea)) &&
      (filterStation === "all" || user.station?.id === Number(filterStation)) &&
      (filterDivision === "all" || (filterDivision === "none" ? !user.division : user.division?.id === Number(filterDivision)));
    const matchesJoined =
      (!filterJoinedFrom || (!!user.joiningDate && user.joiningDate >= filterJoinedFrom)) &&
      (!filterJoinedTo || (!!user.joiningDate && user.joiningDate <= filterJoinedTo));
    
    const matchesDepartment = 
      filterDepartment === "all" || 
      user.department?.id === Number(filterDepartment);
    
    const matchesRole = 
      filterRole === "all" || 
      user.role?.id === Number(filterRole);
    
    const matchesStatus = 
      filterStatus === "all" || 
      (filterStatus === "active" && user.active) ||
      (filterStatus === "inactive" && !user.active);
    
    return matchesSearch && matchesDepartment && matchesRole && matchesStatus && matchesPlace && matchesJoined;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage
  );

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.active).length;
  const inactiveUsers = users.filter((u) => !u.active).length;
  const noDepartment = users.filter((u) => !u.department).length;

  async function handleCreateUser() {
    if (!/^\d{1,20}$/.test(createCode.trim())) {
      setCreateError("Employee Code is required and must contain numbers only.");
      return;
    }
    if (!createName.trim() || !createEmail.trim() || !createPassword) {
      setCreateError("Full Name, Email and Password are required.");
      return;
    }
    if (!placementComplete(createPlacement)) {
      setCreateError("Please select the Area, Station and Department where this person works.");
      return;
    }
    if (!createRole) {
      setCreateError("Please select a role.");
      return;
    }
    if (createPassword.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }
    try {
      setCreateError(null);
      setError(null);
      const roleId = createRole ? Number(createRole) : undefined;
      const newUser = await createUser({
        name: createName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        employee_code: createCode.trim(),
        joining_date: createJoining || null,
        designation: createDesignation.trim() || null,
        role_id: roleId,
        area_id: createPlacement.areaId,
        station_id: createPlacement.stationId,
        department_id: createPlacement.departmentId!,
        division_id: createPlacement.divisionId,
        isActive: createActive,
        manage_all_departments: showCreateScope && createManageAll,
        managed_area_ids: showCreateScope && !createManageAll ? createScope.areaIds : [],
        managed_station_ids: showCreateScope && !createManageAll ? createScope.stationIds : [],
        managed_pairs: showCreateScope && !createManageAll ? createScope.pairs : [],
        extra_assignable_role_ids: showCreateExtras
          ? createExtraRoleIds.filter((id) => createExtraCandidates.some((r) => r.id === id))
          : [],
        sendWelcomeEmail: createSendWelcome,
      });
      
      // Upload avatar as follow-up if a file was selected
      if (createAvatarFile) {
        try {
          await uploadAvatar(newUser.id, createAvatarFile);
          // Refresh user data to get has_avatar updated
          const updatedUsers = await getUsers();
          setUsers(updatedUsers);
        } catch (err: any) {
          console.error("Avatar upload failed:", err);
          setAvatarUploadError("User created, but avatar upload failed");
        }
      }
      
      setUsers((prev) => [...prev, newUser]);
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create user.");
    }
  }

  function resetCreateForm() {
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    setShowPassword(false);
    setCreateCode("");
    setCreateJoining("");
    setCreateDesignation("");
    setCreatePlacement(EMPTY_PLACEMENT);
    setCreateRole("");
    setCreateActive(true);
    setCreateSendWelcome(true);
    setCreateScope(EMPTY_SCOPE);
    setCreateExtraRoleIds([]);
    setCreateExtrasNote(null);
    setCreateAvatarFile(null);
  }

  async function handleDelete(user: UserType) {
    try {
      setError(null);
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setDeleteConfirmUser(null);
    } catch (err: any) {
      setError(err?.message || "Failed to delete user.");
    }
  }

  function toggleUserSelection(userId: number) {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === paginatedUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(paginatedUsers.map((u) => u.id)));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading users...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Manage system users and their access</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Users</span>
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-sm font-semibold">{totalUsers}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Users</span>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <span className="text-emerald-600 text-sm font-semibold">{activeUsers}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{activeUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactive Users</span>
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
              <span className="text-gray-600 text-sm font-semibold">{inactiveUsers}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{inactiveUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">No Department</span>
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <span className="text-amber-600 text-sm font-semibold">{noDepartment}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{noDepartment}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search users"
              placeholder="Search by name, email or employee code..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-foreground"
            />
          </div>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted cursor-pointer">
              Clear filters
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer"
            >
              <Plus size={16} />
              Add User
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" onChange={() => setCurrentPage(1)}>
          <FldSelect
            label="Area"
            aria-label="Filter by area"
            options={[{ value: "all", label: "All Areas" }, ...areas.map((a) => ({ value: a.id.toString(), label: a.name }))]}
            value={filterArea}
            onChange={(e) => { setFilterArea(e.target.value); setFilterStation("all"); }}
          />
          <FldSelect
            label="Station"
            aria-label="Filter by station"
            options={[
              { value: "all", label: "All Stations" },
              ...stations.filter((st) => filterArea === "all" || st.area.id === Number(filterArea)).map((st) => ({ value: st.id.toString(), label: st.code || st.name })),
            ]}
            value={filterStation}
            onChange={(e) => setFilterStation(e.target.value)}
          />
          <FldSelect
            label="Department"
            aria-label="Filter by department"
            options={[
              { value: "all", label: "All Departments" },
              ...departments
                .filter((d) => filterStation === "all" || stations.find((st) => st.id === Number(filterStation))?.departments.some((x) => x.id === d.id))
                .map((d) => ({ value: d.id.toString(), label: d.name })),
            ]}
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          />
          <FldSelect
            label="Division"
            aria-label="Filter by division"
            options={[{ value: "all", label: "All" }, { value: "none", label: "No division" }, ...divisions.map((d) => ({ value: d.id.toString(), label: d.name }))]}
            value={filterDivision}
            onChange={(e) => setFilterDivision(e.target.value)}
          />
          <FldSelect
            label="Role"
            aria-label="Filter by role"
            options={[
              { value: "all", label: "All Roles" },
              ...roles.map((r) => ({ value: r.id.toString(), label: r.name })),
            ]}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          />
          <FldSelect
            label="Status"
            aria-label="Filter by status"
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined from</span>
            <input type="date" aria-label="Joined from" value={filterJoinedFrom} onChange={(e) => setFilterJoinedFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined to</span>
            <input type="date" aria-label="Joined to" value={filterJoinedTo} onChange={(e) => setFilterJoinedTo(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground" data-testid="users-count">
          Showing {filteredUsers.length} of {users.length} users
        </p>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.size === paginatedUsers.length && paginatedUsers.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-blue-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joining Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr 
                  key={user.id} 
                  className="border-b border-border hover:bg-muted/20 cursor-pointer"
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleUserSelection(user.id);
                      }}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{user.employeeCode || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.hasAvatar ? (
                        <img
                          src={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/users/${user.id}/avatar`}
                          alt={user.name}
                          className="w-8 h-8 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <Av name={user.name} className={user.hasAvatar ? 'hidden' : ''} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{user.name}</span>
                        {user.designation && <span className="block text-xs text-muted-foreground" data-testid="user-designation">{user.designation}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.role ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                        {user.role.name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.department?.name || "—"}
                    {user.station && <span className="block text-xs">{user.station.code || user.station.name}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.joiningDate ? fmtDate(user.joiningDate) : "—"}</td>
                  <td className="px-4 py-3">
                    {user.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/users/${user.id}`);
                        }}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 size={14} className="text-muted-foreground" />
                      </button>
                      {canManage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmUser(user);
                          }}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredUsers.length > usersPerPage && (
          <div className="px-4 py-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
            </span>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    currentPage === i + 1
                      ? "bg-blue-500 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      {showCreateDialog && (
        <Dlg
          onClose={() => {
            setShowCreateDialog(false);
            resetCreateForm();
          }}
          title="Create New User"
          size="lg"
        >
          <div className="space-y-4">
            {createError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                <span className="text-red-700">{createError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cu-code" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Employee Code <span className="text-red-500">*</span>
                </label>
                <input
                  id="cu-code"
                  inputMode="numeric"
                  maxLength={20}
                  placeholder="Numbers only"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground"
                />
              </div>
              <div>
                <label htmlFor="cu-joining" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Joining Date
                </label>
                <input
                  id="cu-joining"
                  type="date"
                  value={createJoining}
                  onChange={(e) => setCreateJoining(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground"
                />
              </div>
            </div>

            <FldInput
              label="Full Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />
            <div>
              <label htmlFor="cu-designation" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Designation
              </label>
              <input id="cu-designation" maxLength={120} placeholder="e.g. Assistant Manager HR (optional)"
                value={createDesignation} onChange={(e) => setCreateDesignation(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground" />
              <p className="text-xs text-muted-foreground mt-1">Job title shown on the profile. The role (below) decides what the person can do.</p>
            </div>

            <FldInput
              label="Email Address"
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-foreground pr-8"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatePassword(generatePassword(12))}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} />
                  Generate
                </button>
              </div>
              {createPassword && createPassword.length < 8 && (
                <p className="text-xs text-red-600 mt-1">Password must be at least 8 characters</p>
              )}
            </div>

            <PlacementPicker
              areas={areas}
              stations={stations}
              divisions={divisions}
              value={createPlacement}
              onChange={setCreatePlacement}
              allowedPairs={placeablePairs}
            />

            <FldSelect
              label="Role"
              options={[
                { value: "", label: "Select role" },
                ...assignableRoles.map((r) => ({ value: r.id.toString(), label: r.name })),
              ]}
              value={createRole}
              onChange={(e) => handleCreateRoleChange(e.target.value)}
              required
            />

            {/* Department scope lives on the user — only for roles with a department-based permission */}
            {showCreateScope && (
              <ScopeTreePicker
                areas={areas}
                stations={stations}
                departments={departments}
                value={createScope}
                onChange={handleCreateScopeChange}
                grantable={grantable}
              />
            )}

            {/* Personal extra assignable roles — after the departments, filtered by them */}
            {showCreateExtras && (
              <div>
                <RoleChecklist
                  title="Extra roles this user can assign"
                  help={`On top of the ${selectedCreateRole!.name} role's base list. Shows roles you can assign yourself that are general or belong to the departments ticked above.`}
                  roles={createExtraCandidates}
                  selectedIds={createExtraRoleIds}
                  onChange={(ids) => { setCreateExtraRoleIds(ids); setCreateExtrasNote(null); }}
                  emptyText="No additional roles available for the ticked departments"
                />
                {createExtrasNote && <p className="text-xs text-amber-600 mt-1">{createExtrasNote}</p>}
              </div>
            )}

            {/* Avatar Upload */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Profile Picture
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) {
                        setAvatarUploadError("Image must be under 2MB");
                        return;
                      }
                      setCreateAvatarFile(file);
                      setAvatarUploadError(null);
                    }
                  }}
                  className="hidden"
                  id="avatar-upload"
                />
                <label htmlFor="avatar-upload" className="cursor-pointer">
                  {createAvatarFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <Upload size={16} className="text-blue-500" />
                      <span className="text-sm text-foreground">{createAvatarFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={20} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload photo, JPG/PNG up to 2MB</span>
                    </div>
                  )}
                </label>
              </div>
              {avatarUploadError && (
                <p className="text-xs text-red-600 mt-1">{avatarUploadError}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Account Status
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="active"
                    checked={createActive}
                    onChange={() => setCreateActive(true)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="inactive"
                    checked={!createActive}
                    onChange={() => setCreateActive(false)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-foreground">Inactive</span>
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createSendWelcome}
                onChange={(e) => setCreateSendWelcome(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-foreground">Send welcome email with login details</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  resetCreateForm();
                }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer"
              >
                Create User
              </button>
            </div>
          </div>
        </Dlg>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmUser && (
        <Dlg
          onClose={() => setDeleteConfirmUser(null)}
          title="Delete User"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete <strong>{deleteConfirmUser.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmUser)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </div>
  );
}
