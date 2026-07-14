# Task Manager — Backend (Auth + RBAC + Tasks)

Fully async FastAPI backend with JWT auth (access + refresh tokens),
custom role-based permissions, and task management. Tested end-to-end
before being handed to you — register/login/RBAC/tasks/dashboard all confirmed working.

## What's in here

```
backend/
├── app/
│   ├── main.py              # entry point, wires up all routers, creates tables + seeds permissions on startup
│   ├── config.py             # env-based settings (DB url, JWT secret, token expiry)
│   ├── database.py            # async SQLAlchemy engine/session
│   ├── seed.py                 # seeds the 6 fixed permissions
│   ├── bootstrap_admin.py       # one-time script: makes a registered user an Admin
│   ├── models/                   # SQLAlchemy tables: User, Role, Permission, Task
│   ├── schemas/                    # Pydantic request/response shapes
│   ├── core/
│   │   ├── security.py               # password hashing + JWT create/verify
│   │   └── deps.py                    # get_current_user, require_permission
│   └── routers/
│       ├── auth.py     # register, login, refresh
│       ├── users.py    # list/get/update users, assign roles
│       ├── roles.py    # create roles, set permissions on a role
│       ├── tasks.py    # create/edit/assign/status update/delete tasks
│       └── dashboard.py # summary stats
├── requirements.txt
└── .env.example
```

## Setup (Windows, native Postgres)

You should already have Postgres running with the `taskmanager` user/db
from our earlier setup. If not, see the earlier instructions I gave you.

### 1. Backend setup
```bash
cd backend
copy .env.example .env
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run the server
```bash
uvicorn app.main:app --reload --port 8000
```
On first run, this automatically:
- Creates all 5 tables (users, roles, permissions, role_permission, tasks)
- Seeds the 6 fixed permissions (task:create, task:edit, task:assign, role:manage, user:manage, dashboard:view)

Check http://localhost:8000/docs — the interactive API playground.

### 3. Create your first Admin user
Since NO user has any permission on a fresh system, we bootstrap the
very first Admin directly:

```bash
# Step 1: register normally via the API (use /docs, or curl)
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Your Name\",\"email\":\"you@example.com\",\"password\":\"yourpassword\"}"

# Step 2: promote that user to Admin (creates an Admin role with ALL permissions)
python -m app.bootstrap_admin you@example.com
```

Now log in via `/auth/login` — the returned access token will have Admin rights.
Use it as `Authorization: Bearer <access_token>` on any protected route,
or click "Authorize" on the `/docs` page.

## Key concepts to understand (don't just skim — ask me if unclear)

- **Why async?** (`database.py`) — with sync code, one slow DB query blocks
  the whole server thread. With async, the server can serve other users'
  requests while waiting on the database. This matters once real users hit
  the app at the same time — exactly what you asked for.

- **Access token vs refresh token** (`core/security.py`) — access token is
  short-lived (15 min) and sent on every request. Refresh token is long-lived
  (7 days) and ONLY used to get a new access token without logging in again.

- **`require_permission()`** (`core/deps.py`) — this is the actual enforcement
  of your RBAC idea. Every protected route declares which permission it
  needs, and this dependency checks the current user's role against it
  BEFORE the route's own code runs.

- **Why `/tasks` (GET) has no permission check but `/tasks` (POST) does** —
  intentional design choice: anyone logged in can view tasks, but only
  users whose role has `task:create` can make new ones. Same pattern for
  `task:edit`, `task:assign`.

- **Why the status-update route is special** (`routers/tasks.py`) — a person
  a task is ASSIGNED to can move it through its stages even without
  `task:edit` permission — otherwise employees couldn't update their own
  task's progress unless an admin explicitly gave them edit rights.

## Tested and confirmed working

- Register → Login → get access + refresh tokens
- A user with no role gets 403 on permission-gated routes, but can still view tasks
- Admin (all permissions) can create roles, create tasks, assign tasks, view dashboard
- Refresh token flow issues new token pair correctly
- Unauthenticated requests get a clean 401

## Next: Frontend
Now that backend is solid and tested, we can plan the React frontend to
consume these exact APIs.
