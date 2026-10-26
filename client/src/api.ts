import type { AppNotification, Project, Task, UserLite } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText);
  return body as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: UserLite }>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ username, password }) }),
  users: (t: string) => request<UserLite[]>("/users", t),
  projects: (t: string) => request<Project[]>("/projects", t),
  tasks: (t: string, projectId: string) => request<{ tasks: Task[]; serverTime: string }>(`/projects/${projectId}/tasks`, t),
  createTask: (t: string, projectId: string, title: string) =>
    request<Task>(`/projects/${projectId}/tasks`, t, { method: "POST", body: JSON.stringify({ title }) }),
  patchTask: (t: string, id: string, patch: Partial<Pick<Task, "title" | "status" | "assigneeId">>) =>
    request<Task>(`/tasks/${id}`, t, { method: "PATCH", body: JSON.stringify(patch) }),
  sync: (t: string, projectId: string, since: string) =>
    request<{ tasks: Task[]; notifications: AppNotification[]; serverTime: string }>(
      `/sync?projectId=${projectId}&since=${encodeURIComponent(since)}`, t),
  notifications: (t: string) => request<AppNotification[]>("/notifications", t),
};
