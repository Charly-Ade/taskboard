export type TaskStatus = "todo" | "doing" | "done";
export interface Task { id: string; projectId: string; title: string; status: TaskStatus; assigneeId: string | null; updatedAt: string }
export interface Project { id: string; name: string }
export interface UserLite { id: string; name: string }
export interface AppNotification { id: string; message: string; taskId: string; projectId: string; createdAt: string; read: boolean }
export type ConnStatus = "connected" | "reconnecting" | "disconnected";
export interface Session { token: string; user: UserLite }
