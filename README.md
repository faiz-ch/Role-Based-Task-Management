# Fix round 3: Issues 2, 3a and 3b

There are **26 files**: 24 replacements and 2 new files. Copy each one to the same path in your project.
This round builds on round 2, so apply it on top of round 2.

## How to apply
1. Commit or back up your project first.
2. Copy the `backend` and `frontend` folders from this package into your project folder and choose **Replace**.
3. In Windsurf Source Control you should see **24 modified files + 2 new files** (`api/queries.ts`, `api/queryClient.ts`).
4. Install the new library. In a terminal inside the `frontend` folder:
   ```
   npm install
   ```
   This installs **@tanstack/react-query 5.59.0**, which is already listed in `package.json`. Docker does this automatically when building.
5. Restart: `docker compose up --build`. **No database reset is needed.**

---

## What each file does

### New files (the shared data store)
| File | Purpose |
|---|---|
| `frontend/src/app/api/queryClient.ts` | Creates the **one shared store** for the whole app. Data counts as fresh for 30 s, stays in memory for 10 min, is re-checked when you return to the tab, and failed requests are retried once (but not "no permission" or "not found" errors). |
| `frontend/src/app/api/queries.ts` | `useCachedQuery()`: how every page now reads data. It returns the data plus a `setData` that works exactly like the old `setProjects(...)`, so existing page code kept working. Also holds the labels (`qk`) and freshness times: 5 min for departments, roles and permissions; 2 min for users; 30 s plus a 60 s re-check for projects, tasks and the dashboard. |

### Wiring
| File | What changed |
|---|---|
| `frontend/src/main.tsx` | Wraps the app in the shared store. |
| `frontend/src/app/api/client.ts` | **Refresh after every save (Issue 3b).** After any successful POST, PUT, PATCH or DELETE, the data on screen is refreshed. Several quick saves (for example "create task" then "set team") are combined into **one** refresh. Departments, roles, permissions and categories refresh only when the save affects them. |
| `frontend/src/app/context/AuthContext.tsx` | The store is **emptied at login and logout**, so the next person never sees the previous user's data. |
| `frontend/package.json`, `package-lock.json` | Adds `@tanstack/react-query` 5.59.0, pinned to that exact version. |

### Backend: send only what is needed
| File | What changed |
|---|---|
| `backend/app/routers/tasks.py` | `GET /tasks?project_id=N` returns only that project's tasks. |
| `backend/app/schemas/project.py` | Each project now carries `task_count` and `done_task_count`. |
| `backend/app/routers/projects.py` | Counts the tasks of **all** projects in **one** grouped query (`_task_counts`). |
| `frontend/src/app/api/tasks.ts`, `api/projects.ts`, `types.ts` | Support the new filter and the two count fields. |

### Pages (Issue 2): each now reads from the shared store instead of downloading everything when it opens
| Page | Notes |
|---|---|
| `ProjectsPage.tsx` | No longer downloads all tasks; progress comes from the server's counts. Users are downloaded only if you can create projects. |
| `ProjectDetailPage.tsx` | Downloads only **this project's** tasks. Activity, team, reports, milestones and files refresh after any save. |
| `TasksPage.tsx`, `TaskDetailPage.tsx`, `SubtaskDetailPage.tsx` | Same pattern. |
| `UsersPage.tsx`, `UserDetailPage.tsx` | Same pattern. The Edit form now fills from the **latest** data each time you open it. |
| `RolesPage.tsx`, `RoleDetailPage.tsx` | Same pattern. |
| `DepartmentsPage.tsx`, `DepartmentDetailPage.tsx` | Same pattern. The department page uses the server's task counts and no longer downloads all tasks. |
| `DashboardPage.tsx`, `OverdueViewAllPage.tsx` | Re-checked every 60 s while open (Issue 3a). |

---

## Test results (fresh database, real browser)

### Issue 2: server requests per navigation
| Action | Before | After |
|---|---|---|
| Open Projects (first time) | 4 (incl. **all tasks**) | 3 (no tasks) |
| Open Tasks | 5 | **1** (projects and departments reused) |
| Projects again | 4 | **0** |
| Open Project 1 | 8 (incl. **all tasks**) | 7 (only its own tasks) |
| Back to Projects | 4 | **0** |
| Open Project 1 again | 8 | **0** |
| Departments / Dashboard (already cached) | 2 / 1 | **0 / 0** |
| Users again | 4 | **0** |

### Issue 3b: your own saves
- Create a task with a team: the task list and Activity refresh automatically, and the task shows its team and lead (Dr Ahmed) with no F5.
- That save costs **7** refresh requests (it was 16 before the "combine quick saves" improvement).
- Rename a project in Settings: the Projects list shows the new name with no F5.

### Issue 3a: other people's changes
- A colleague renamed a project while the Projects page was open. It appeared after **59 s**, with no navigation.
- Returning to the tab after 30 s or more refreshes **immediately**. Returning sooner sends **no** request.

### Safety
- Logging out and in as another user: the store is emptied, and the department head sees only his own department's users.
- No uncaught page errors and no server errors.

### Regression (nothing broken)
- 51/51 backend scenario checks (roles, departments, assignable roles)
- 19/19 refresh and progress-bar browser checks (rounds 1–2)
- 27/29 earlier screen checks. The 2 remaining are the same test-timing issue on the Role detail Permissions tab as in round 2: the boxes tick correctly a moment after the data loads (confirmed 3 times).
- `vite build` succeeds. TypeScript: same 13 older errors, no new ones.

## Note
- On the Projects and Department pages, a project's progress now counts **all** tasks in the project, which is the true project progress. Before, it counted only the tasks the viewer could see.

## Remaining
- **Issue 7:** paging, 25 per page (next step)
- **Issue 8:** secure login cookie (before go-live)
- **Revoke the Gmail app password** in `backend/.env.example`
