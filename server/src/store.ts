// Tiny persistent store (JSON file). Swap for Postgres/Mongo later - the
// rest of the app only talks to this interface.
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { Notification, Project, Task, User } from "./types.js";

interface DB { users: User[]; projects: Project[]; tasks: Task[]; notifications: Notification[] }

const FILE = process.env.DB_FILE ?? path.resolve(process.cwd(), "data.json");
const PERSIST = process.env.NODE_ENV !== "test" && !process.env.NO_PERSIST;

function seed(): DB {
  const hash = bcrypt.hashSync("password123", 8);
  const now = new Date().toISOString();
  const mk = (id: string, name: string): User => ({ id, name, passwordHash: hash });
  return {
    users: [mk("u1", "charles"), mk("u2", "bob"), mk("u3", "carol")],
    projects: [{ id: "p1", name: "Website Redesign" }, { id: "p2", name: "Mobile App" }],
    tasks: [
      { id: "t1", projectId: "p1", title: "Design landing page", status: "todo", assigneeId: null, createdAt: now, updatedAt: now },
      { id: "t2", projectId: "p1", title: "Set up CI pipeline", status: "doing", assigneeId: "u2", createdAt: now, updatedAt: now },
      { id: "t3", projectId: "p1", title: "Write copy", status: "done", assigneeId: "u3", createdAt: now, updatedAt: now },
      { id: "t4", projectId: "p2", title: "Auth screens", status: "todo", assigneeId: null, createdAt: now, updatedAt: now },
    ],
    notifications: [],
  };
}

function load(): DB {
  if (PERSIST && fs.existsSync(FILE)) {
    try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as DB; } catch { /* fall through */ }
  }
  return seed();
}

const db = load();
const save = () => { if (PERSIST) fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); };
save();

export const store = {
  findUserByName: (name: string) => db.users.find((u) => u.name === name.toLowerCase()),
  findUser: (id: string) => db.users.find((u) => u.id === id),
  listUsers: () => db.users.map(({ id, name }) => ({ id, name })),
  listProjects: () => db.projects,
  findProject: (id: string) => db.projects.find((p) => p.id === id),
  listTasks: (projectId: string) => db.tasks.filter((t) => t.projectId === projectId),
  findTask: (id: string) => db.tasks.find((t) => t.id === id),

  createTask(projectId: string, title: string): Task {
    const now = new Date().toISOString();
    const t: Task = { id: randomUUID(), projectId, title, status: "todo", assigneeId: null, createdAt: now, updatedAt: now };
    db.tasks.push(t); save(); return t;
  },
  updateTask(id: string, patch: Partial<Pick<Task, "title" | "status" | "assigneeId">>): Task | undefined {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return undefined;
    Object.assign(t, patch);
    t.updatedAt = nextTimestamp(t.updatedAt);
    save(); return t;
  },
  tasksSince: (projectId: string, since: string) =>
    db.tasks.filter((t) => t.projectId === projectId && t.updatedAt > since),

  createNotification(n: Omit<Notification, "id" | "createdAt" | "read">): Notification {
    const full: Notification = { ...n, id: randomUUID(), createdAt: new Date().toISOString(), read: false };
    db.notifications.push(full); save(); return full;
  },
  notificationsSince: (userId: string, since: string) =>
    db.notifications.filter((n) => n.userId === userId && n.createdAt > since),
  notificationsFor: (userId: string) => db.notifications.filter((n) => n.userId === userId).slice(-50),
};

// Guarantees strictly increasing updatedAt so "> since" never misses
// two updates that land in the same millisecond.
let lastTs = 0;
function nextTimestamp(_prev: string): string {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return new Date(lastTs).toISOString();
}
