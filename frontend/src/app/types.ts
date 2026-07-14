export type Status = "To Do" | "In Progress" | "Review" | "Done" | "Rejected";
export type Priority = "Low" | "Medium" | "High";
export type Page = "login" | "register" | "dashboard" | "tasks" | "users" | "roles";

export interface UserType {
  id: number;
  name: string;
  email: string;
  active: boolean; // maps to backend's `is_active`
  role: { id: number; name: string } | null;
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
}

export interface Role {
  id: number;
  name: string;
  permissionIds: number[];
}

export interface PermDef {
  id: number;
  name: string;
  description: string;
}
