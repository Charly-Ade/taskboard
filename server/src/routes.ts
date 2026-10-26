import express from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Namespace } from "socket.io";
import { requireAuth, signToken } from "./auth.js";
import { store } from "./store.js";
import { projectRoom, userRoom } from "./socket.js";

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const createTaskSchema = z.object({ title: z.string().trim().min(1).max(200) });
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["todo", "doing", "done"]).optional(),
    assigneeId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export function createRouter(board: Namespace) {
  const r = express.Router();

  r.post("/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
    const user = store.findUserByName(parsed.data.username);
    if (!user || !bcrypt.compareSync(parsed.data.password, user.passwordHash))
      return res.status(401).json({ error: "Bad credentials" });
    res.json({ token: signToken({ sub: user.id, name: user.name }), user: { id: user.id, name: user.name } });
  });

  r.use(requireAuth);

  r.get("/users", (_req, res) => res.json(store.listUsers()));
  r.get("/projects", (_req, res) => res.json(store.listProjects()));

  r.get("/projects/:id/tasks", (req, res) => {
    if (!store.findProject(req.params.id)) return res.status(404).json({ error: "Project not found" });
    res.json({ tasks: store.listTasks(req.params.id), serverTime: new Date().toISOString() });
  });

  r.post("/projects/:id/tasks", (req, res) => {
    if (!store.findProject(req.params.id)) return res.status(404).json({ error: "Project not found" });
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    const task = store.createTask(req.params.id, parsed.data.title);
    board.to(projectRoom(task.projectId)).emit("task:updated", task);
    res.status(201).json(task);
  });

  // Validated REST update -> scoped broadcast -> targeted notification.
  r.patch("/tasks/:id", (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    const existing = store.findTask(req.params.id);
    if (!existing) return res.status(404).json({ error: "Task not found" });
    const { assigneeId } = parsed.data;
    if (assigneeId && !store.findUser(assigneeId)) return res.status(400).json({ error: "Unknown assignee" });

    const prevAssignee = existing.assigneeId;
    const task = store.updateTask(existing.id, parsed.data)!;

    // 1) project room only - never a global broadcast
    board.to(projectRoom(task.projectId)).emit("task:updated", task);

    // 2) assignment -> persist, then push to the assignee's personal room
    if (assigneeId && assigneeId !== prevAssignee && assigneeId !== req.user!.id) {
      const n = store.createNotification({
        userId: assigneeId,
        type: "task:assigned",
        message: `${req.user!.name} assigned you "${task.title}"`,
        taskId: task.id,
        projectId: task.projectId,
      });
      board.to(userRoom(assigneeId)).emit("notification:new", n);
    }
    res.json(task);
  });

  // Resync endpoint used by the client on every (re)connect.
  r.get("/sync", (req, res) => {
    const since = typeof req.query.since === "string" ? req.query.since : new Date(0).toISOString();
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
    if (Number.isNaN(Date.parse(since))) return res.status(400).json({ error: "Invalid since" });
    res.json({
      tasks: projectId ? store.tasksSince(projectId, since) : [],
      notifications: store.notificationsSince(req.user!.id, since),
      serverTime: new Date().toISOString(),
    });
  });

  r.get("/notifications", (req, res) => res.json(store.notificationsFor(req.user!.id)));
  return r;
}
