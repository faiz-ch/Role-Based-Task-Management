import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router";
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

// Auth guard component to redirect unauthenticated users
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!currentUser) {
      navigate("/login", { replace: true });
    } else if ((location.pathname === "/login" || location.pathname === "/register") && currentUser) {
      // Redirect authenticated users away from login/register
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, permissions, navigate, location.pathname]);

  if (!currentUser) {
    return null;
  }

  return <>{children}</>;
}

// Public routes (login/register) - redirect if already authenticated
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, permissions } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, permissions, navigate]);

  if (currentUser) {
    return null;
  }

  return <>{children}</>;
}

function AppContent() {
  const { currentUser, permissions } = useAuth();
  const navigate = useNavigate();

  // Permission-based redirect after login
  useEffect(() => {
    if (currentUser && permissions.length > 0) {
      // Only redirect if we're on a public route
      if (window.location.pathname === "/login" || window.location.pathname === "/register") {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [currentUser, permissions, navigate]);

  const noRole = !currentUser?.role;

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