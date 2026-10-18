import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Page } from "./types";
import { Shell } from "./components/Shell";
import { NoRoleView } from "./components/NoRoleView";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TasksPage } from "./pages/TasksPage";
import { UsersPage } from "./pages/UsersPage";
import { RolesPage } from "./pages/RolesPage";
import { RoleDetailPage } from "./pages/RoleDetailPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { SubtaskDetailPage } from "./pages/SubtaskDetailPage";
import { DepartmentDetailPage } from "./pages/DepartmentDetailPage";
import { UserDetailPage } from "./pages/UserDetailPage";
import { OverdueViewAllPage } from "./pages/OverdueViewAllPage";

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  );
}

// Protects pages that need a logged-in user.
// Waits until the session check after a refresh (F5) has finished before deciding.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, initialized } = useAuth();
  const location = useLocation();

  // 1. Still restoring the session -> wait, do not redirect yet
  if (!initialized) {
    return <FullPageSpinner />;
  }

  // 2. Check finished and nobody is logged in -> Login, remembering the requested page
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // 3. Logged in -> show the requested page
  return <>{children}</>;
}

// Login / Register pages. If already logged in, go back to the page the user
// originally asked for (or the dashboard if there is none).
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, initialized } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return <FullPageSpinner />;
  }

  if (currentUser) {
    const from = (location.state as { from?: string } | null)?.from;
    const target = from && from !== "/login" && from !== "/register" ? from : "/dashboard";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { currentUser, permissions } = useAuth();

  const noRole = !currentUser?.role && !currentUser?.department;

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <AuthGuard>
            {noRole ? (
              <NoRoleView />
            ) : (
              <Shell>
                <Routes>
                  <Route
                    path="/dashboard"
                    element={<DashboardPage />}
                  />
                  <Route path="/dashboard/overdue/tasks" element={<OverdueViewAllPage type="tasks" />} />
                  <Route path="/dashboard/overdue/subtasks" element={<OverdueViewAllPage type="subtasks" />} />
                  <Route path="/dashboard/overdue/projects" element={<OverdueViewAllPage type="projects" />} />
                  <Route path="/dashboard/overdue/:type" element={<OverdueViewAllPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
                  <Route path="/subtasks/:subtaskId" element={<SubtaskDetailPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route
                    path="/users"
                    element={
                      permissions.includes("user:manage") ? (
                        <UsersPage />
                      ) : (
                        <Navigate to="/tasks" replace />
                      )
                    }
                  />
                  <Route
                    path="/users/:userId"
                    element={
                      permissions.includes("user:manage") ? (
                        <UserDetailPage />
                      ) : (
                        <Navigate to="/tasks" replace />
                      )
                    }
                  />
                  <Route
                    path="/roles"
                    element={
                      permissions.includes("role:manage") ? (
                        <RolesPage />
                      ) : (
                        <Navigate to="/tasks" replace />
                      )
                    }
                  />
                  <Route
                    path="/roles/:roleId"
                    element={
                      permissions.includes("role:manage") ? (
                        <RoleDetailPage />
                      ) : (
                        <Navigate to="/tasks" replace />
                      )
                    }
                  />
                  <Route
                    path="/departments"
                    element={
                      permissions.includes("department:manage") ? (
                        <DepartmentsPage />
                      ) : (
                        <Navigate to="/tasks" replace />
                      )
                    }
                  />
                  <Route
                    path="/departments/:departmentId"
                    element={
                      permissions.includes("department:manage") ? (
                        <DepartmentDetailPage />
                      ) : (
                        <Navigate to="/tasks" replace />
                      )
                    }
                  />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Shell>
            )}
          </AuthGuard>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}