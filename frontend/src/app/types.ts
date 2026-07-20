export type Status = "To Do" | "Review" | "Done" | "Reschedule";
export type Priority = "Low" | "Medium" | "High";
export type Page = "login" | "register" | "dashboard" | "tasks" | "taskDetail" | "users" | "roles" | "departments" | "categories";

export interface Department {
  id: number;
  name: string;
}

export interface Category {
  id: number;
  name: string;
  permissions: string[];
}

export interface Role {
  id: number;
  name: string;
  category: Category | null;
  allDepartments: boolean;
  departments: Department[];
  assignableCategories: Category[];
}

export interface UserType {
  id: number;
  name: string;
  email: string;
  active: boolean; // maps to backend's `is_active`
  role: Role | null;
  department: Department | null;
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
  departmentId: number | null;
}

export interface PermDef {
  id: number;
  name: string;
  description: string;
}