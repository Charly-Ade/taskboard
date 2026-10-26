export type TaskStatus = "todo" | "doing" | "done";

export interface User { id: string; name: string; passwordHash: string }
export interface Project { id: string; name: string }
export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string; // server clock, ISO string; drives resync
}
export interface Notification {
  id: string;
  userId: string;
  type: "task:assigned";
  message: string;
  taskId: string;
  projectId: string;
  createdAt: string;
  read: boolean;
}
export interface JwtPayload { sub: string; name: string }
export interface SocketData { user: { id: string; name: string } }
