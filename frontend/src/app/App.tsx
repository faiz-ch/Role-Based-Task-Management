import React, { useState, useEffect } from "react";
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
import { DepartmentsPage } from "./pages/DepartmentsPage";

function AppContent() {
  const { currentUser, permissions } = useAuth();
  const [page, setPage] = useState<Page>("login");

  // Sync page routing on login/logout
  useEffect(() => {
    if (currentUser) {
      setPage(permissions.includes("dashboard:view") ? "dashboard" : "tasks");
    } else {
      setPage("login");
    }
  }, [currentUser, permissions]);

  // If not logged in, render login/register pages
  if (!currentUser) {
    if (page === "register") {
      return <RegisterPage onGoLogin={() => setPage("login")} />;
    }
    return <LoginPage onGoLogin={() => setPage("login")} onGoRegister={() => setPage("register")} />;
  }

  const noRole = !currentUser.role;

  return (
    <Shell page={page} setPage={setPage}>
      {noRole ? (
        <NoRoleView />
      ) : (
        <>
          {page === "dashboard" && permissions.includes("dashboard:view") && (
            <DashboardPage />
          )}
          {page === "tasks" && <TasksPage />}
          {page === "users" && permissions.includes("user:manage") && (
            <UsersPage />
          )}
          {page === "roles" && permissions.includes("role:manage") && (
            <RolesPage />
          )}
          {page === "departments" && permissions.includes("user:manage") && (
            <DepartmentsPage />
          )}
        </>
      )}
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
