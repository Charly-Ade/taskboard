import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { AppNotification, Project, Session, Task, UserLite } from "./types";
import Login from "./components/Login";
import Board from "./components/Board";

const KEY = "taskboard.session";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);

  const logout = useCallback(() => { sessionStorage.removeItem(KEY); setSession(null); }, []);
  const onLogin = (s: Session) => { sessionStorage.setItem(KEY, JSON.stringify(s)); setSession(s); };

  useEffect(() => {
    if (!session) return;
    Promise.all([api.projects(session.token), api.users(session.token)])
      .then(([p, u]) => { setProjects(p); setUsers(u); })
      .catch(logout);
  }, [session, logout]);

  if (!session) return <Login onLogin={onLogin} />;
  return <Board session={session} projects={projects} users={users} onLogout={logout} />;
}

// helpers shared with Board
export const upsertTasks = (prev: Task[], incoming: Task[]): Task[] => {
  const map = new Map(prev.map((t) => [t.id, t]));
  for (const t of incoming) {
    const cur = map.get(t.id);
    if (!cur || t.updatedAt >= cur.updatedAt) map.set(t.id, t); // ignore stale
  }
  return [...map.values()];
};
export const upsertNotifs = (prev: AppNotification[], incoming: AppNotification[]): AppNotification[] => {
  const seen = new Set(prev.map((n) => n.id));
  const fresh = incoming.filter((n) => !seen.has(n.id));
  return fresh.length ? [...fresh, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : prev;
};
