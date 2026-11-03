# Fix round 4: user form sections and dashboard filters

This package has **11 files**: 10 replacements and 1 new file. Apply it on top of round 3.
**No database change. No reset.**

## How to apply
1. Commit or back up your project first.
2. Copy the `backend` and `frontend` folders from this package into your project folder and choose **Replace**.
3. In Windsurf Source Control you should see **10 modified files and 1 new file** (`components/DashboardFilters.tsx`).
4. Test locally: `docker compose up --build`
5. Push to GitHub. Then on the VPS run:
   ```
   cd ~/app && git pull && docker compose up -d --build
   ```

---

## Part 1: user form shows only what applies

| Section | Shown when |
|---|---|
| Department (belongs to) | Always |
| Role | Always |
| **Departments this user manages** | The role has **Project view/manage**, **User view/manage** or **Department manage** |
| **Extra roles this user can assign** | The role has **User manage**. It appears **after** the departments and lists only general roles plus roles tagged to the ticked departments. |

Behaviour:
- **Changing the role** clears any section that no longer applies.
- **Unticking a department** removes its tagged extra roles, with a note such as *"Removed HR Officer: its department is no longer managed by this user."*
- **The server enforces the same rules.** Department ticks and extra roles that don't apply to the role are cleared on create, on edit, and when the role changes. The clean-up is written to the user's activity log.
- **Giving an extra role tagged to a department the user doesn't manage is refused** with a clear message.
- **Edit form save order:** the role is saved **first**, so department and extra-role changes are checked against the **new** role.
- **Role page reminder:** when a role that already has users gains a department-based permission, a reminder appears saying those users need *Departments this user manages* set on their profiles.

| File | Change |
|---|---|
| `backend/app/routers/users.py` | `SCOPE_PERMISSIONS`, `_enforce_form_rules()`, `_check_extras_fit_scope()`; create, edit and change-role use them |
| `frontend/src/app/utils/roleAccess.ts` | `roleNeedsDepartments`, `roleCanManageUsers`, `filterRolesByDepartments`, `pruneExtraRoles` |
| `frontend/src/app/pages/UsersPage.tsx` | Create form: show/hide, ordering, live filtering, note |
| `frontend/src/app/pages/UserDetailPage.tsx` | Edit form: the same, plus role saved first |
| `frontend/src/app/pages/RoleDetailPage.tsx` | The reminder |

---

## Part 2: dashboard

**Fixes**
- **Gap 1:** users with **Project view** now get the department dashboard, not just their own tasks.
- **Gap 2:** the employee dashboard now includes tasks where the person is a **team member**.
- **Also fixed:** someone with **All Departments** but **no project permission** (for example a project lead whose role only has User view) was shown **every** project. They now see only the projects they lead.

**Filters:** `[Department] [Project] [Time period] [Clear]`
- **Managers** get Department, Project and Time period. **Employees** get Project and Time period.
- The **Project list follows the Department** you choose.
- **Time period** options: Any time, Due this week (Mon–Sun), Due this month, Overdue only, and Custom dates (From/To date boxes).
- **All cards and lists update together.** The previous numbers stay on screen while the new ones load, with "Updating…" shown.
- The **"View all" overdue pages use the same filters**, so their counts match the dashboard.
- The choice is **remembered per person** in that browser. A saved department or project the person can no longer see is dropped automatically.
- **Safety:** the server refuses (403) any department or project outside the person's dashboard view. Filters can only **narrow** what's shown.
- **Speed:** the database now pre-selects only matching rows instead of loading every task. The existing visibility rules still make the final decision, so the results are unchanged.

| File | Change |
|---|---|
| `backend/app/routers/dashboard.py` | Gaps 1–2, filters on all 4 dashboard addresses, new `GET /dashboard/filter-options`, database pre-filter |
| `frontend/src/app/api/dashboard.ts` | Sends the filters; adds `getDashboardFilterOptions()` |
| `frontend/src/app/api/queries.ts` | Cache labels per filter combination; `keepPrevious` option |
| `frontend/src/app/components/DashboardFilters.tsx` | **New.** The filter bar and the shared filter state |
| `frontend/src/app/pages/DashboardPage.tsx` | Filter bar; "(filtered)" in the subtitle |
| `frontend/src/app/pages/OverdueViewAllPage.tsx` | The same filter bar and filters |

**Notes**
- With a **Department or Project filter** on, **standalone tasks** (tasks with no project) are not counted, because they don't belong to any department.
- **Custom dates** use the browser's own date boxes rather than the date-and-time picker, because only a date is needed.

---

## Test results (fresh database)

| Check | Result |
|---|---|
| New backend checks (form rules, gaps, filters, 403 safety, dashboard total = Tasks page total for 4 user types, overdue counts = "View all" lists) | **45/45** |
| New browser checks (create and edit form show/hide, ordering, filtering, note, role-first save, role reminder, filter bar for COO / HR Head / employee / viewer, View-all match, remembered filters, Clear, stale filter) | **34/34** |
| Earlier backend scenario (roles, departments, assignable roles) | **51/51**, after updating the test's "Team Lead" role to include User manage. Extra roles are now intentionally ignored for roles without it. |
| Earlier refresh / navigation browser checks | **18/19**. The one miss also fails on the round-3 code with the same test data, so it isn't caused by this round. |
| `vite build` | ✅ |
| TypeScript | No new errors (same older ones as before) |
| Server errors during all runs | 0 |
