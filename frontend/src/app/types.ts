export type Status = "To Do" | "Review" | "Done" | "Reschedule";
export type Priority = "Low" | "Medium" | "High";
export type ProjectStatus = "Planning" | "Active" | "Pending Approval" | "Done" | "Archived";
export type Page = "login" | "register" | "dashboard" | "tasks" | "taskDetail" | "users" | "roles" | "departments" | "projects" | "projectDetail";

export interface Department {
  id: number;
  name: string;
  description: string | null;
  headId: number | null;
  head: { id: number; name: string; email: string } | null;
  color: string;
  isActive: boolean;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  permissions: string[];
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  color: string;
  isActive: boolean;
  isSystem: boolean;
  createdBy: number | null;
  creator: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
  allDepartments: boolean;
  departments: { id: number; name: string }[];
  assignableRoles: { id: number; name: string }[];
  userCount: number;
}

export interface UserType {
  id: number;
  name: string;
  email: string;
  active: boolean; // maps to backend's `is_active`
  role: Role | null;
  department: Department | null;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  createdBy: number;
  leadId: number | null;
  teamApprovedBy: number | null;
  teamApprovedAt: string | null;
  dueDate: string;
  createdAt: string;
  departmentIds: number[];
  teamUserIds: number[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string;
  createdAt: string;
  creatorId: number;
  assigneeId: number | null;
  projectId: number;
  leadId: number | null;
  teamApprovedBy: number | null;
  teamApprovedAt: string | null;
  teamUserIds: number[];
}

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string;
  createdBy: number;
  createdAt: string;
  assigneeIds: number[];
}

export interface PermDef {
  id: number;
  name: string;
  description: string;
}