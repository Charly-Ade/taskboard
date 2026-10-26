import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { upsertNotifs, upsertTasks } from "../App";
import { useBoardSocket } from "../useBoardSocket";
import ConnectionStatus from "./ConnectionStatus";
import type { AppNotification, Project, Session, Task, TaskStatus, UserLite } from "../types";

const COLUMNS: { key: TaskStatus; title: string }[] = [
  { key: "todo", title: "To do" },
  { key: "doing", title: "In progress" },
  { key: "done", title: "Done" },
];

interface Props { session: Session; projects: Project[]; users: UserLite[]; onLogout: () => void }

export default function Board({ session, projects, users, onLogout }: Props) {
  const { token, user } = session;
  const [projectId, setProjectId] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (!projectId && projects[0]) setProjectId(projects[0].id); }, [projects, projectId]);
  useEffect(() => { api.notifications(token).then(setNotifs).catch(() => {}); }, [token]);

  const onTasks = useCallback((incoming: Task[]) => setTasks((p) => upsertTasks(p, incoming)), []);
  const onNotifications = useCallback((incoming: AppNotification[]) => {
    setNotifs((p) => upsertNotifs(p, incoming));
    setToast(incoming[0]);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const { status, lastReason, reconnectNow } = useBoardSocket({
    token, projectId, onTasks, onNotifications, onAuthError: onLogout,
  });

  // switching projects: clear + initial load (the socket hook handles room join/leave)
  useEffect(() => {
    if (!projectId) return;
    setTasks([]);
    api.tasks(token, projectId).then((r) => setTasks(r.tasks)).catch(() => {});
  }, [projectId, token]);

  const patch = async (id: string, p: Partial<Pick<Task, "status" | "assigneeId">>) => {
    setError("");
    try { onTasks([await api.patchTask(token, id, p)]); } catch (e: any) { setError(e.message); }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try { onTasks([await api.createTask(token, projectId, title)]); setTitle(""); } catch (err: any) { setError(err.message); }
  };

  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="app">
      <header>
        <h1>Live Task Board</h1>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="project">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="spacer" />
        <ConnectionStatus status={status} reason={lastReason} onRetry={reconnectNow} />
        <span className="muted">{user.name}</span>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </header>

      {toast && <div className="toast">🔔 {toast.message}</div>}
      {error && <p className="error">{error}</p>}

      <form onSubmit={add} className="add">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title…" aria-label="new task" />
        <button type="submit">Add task</button>
      </form>

      <main>
        <div className="columns">
          {COLUMNS.map((col) => (
            <section key={col.key} className="column">
              <h2>{col.title} <span className="count">{tasks.filter((t) => t.status === col.key).length}</span></h2>
              {tasks.filter((t) => t.status === col.key).map((t) => (
                <article key={t.id} className="task">
                  <strong>{t.title}</strong>
                  <div className="row">
                    <select value={t.assigneeId ?? ""} onChange={(e) => patch(t.id, { assigneeId: e.target.value || null })} aria-label="assignee">
                      <option value="">Unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as TaskStatus })} aria-label="status">
                      {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
                    </select>
                  </div>
                  <span className="muted small">{nameOf(t.assigneeId)}</span>
                </article>
              ))}
            </section>
          ))}
        </div>

        <aside className="notifs">
          <h2>Notifications {unread > 0 && <span className="count">{unread}</span>}</h2>
          {notifs.length === 0 && <p className="muted small">Nothing yet. Ask another user to assign you a task.</p>}
          {notifs.map((n) => (
            <div key={n.id} className="notif">
              {n.message}
              <div className="muted small">{new Date(n.createdAt).toLocaleTimeString()}</div>
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}
