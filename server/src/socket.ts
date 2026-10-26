import type { Server as HttpServer } from "node:http";
import { Server, type Namespace } from "socket.io";
import { verifyToken } from "./auth.js";
import { store } from "./store.js";
import type { SocketData } from "./types.js";

export const projectRoom = (id: string) => `project:${id}`;
export const userRoom = (id: string) => `user:${id}`;

export async function createSocketServer(http: HttpServer) {
  const useRedis = !!process.env.REDIS_URL;
  const io = new Server(http, {
    cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" },
    // Stretch goal: short-gap recovery. The classic Redis adapter does not
    // support it, so we only enable it for single-instance runs.
    connectionStateRecovery: useRedis ? undefined : { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: false },
  });

  if (useRedis) {
    const { createAdapter } = await import("@socket.io/redis-adapter");
    const { default: Redis } = await import("ioredis");
    const pub = new Redis(process.env.REDIS_URL!);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    console.log("Redis adapter enabled");
  }

  const board: Namespace = io.of("/board");

  // --- JWT auth middleware: runs once per connection attempt -------------
  board.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized: missing token"));
    try {
      const p = verifyToken(token);
      (socket.data as SocketData).user = { id: p.sub, name: p.name };
      next();
    } catch {
      next(new Error("unauthorized: invalid or expired token"));
    }
  });

  board.on("connection", (socket) => {
    const user = (socket.data as SocketData).user;
    // Personal room: every tab/device of this user lands here.
    socket.join(userRoom(user.id));

    socket.on("board:join", (projectId: string, ack?: (r: { ok: boolean; error?: string }) => void) => {
      if (!store.findProject(projectId)) return ack?.({ ok: false, error: "Unknown project" });
      // One board at a time per socket: leave any previous project room.
      for (const room of socket.rooms) {
        if (room.startsWith("project:") && room !== projectRoom(projectId)) socket.leave(room);
      }
      socket.join(projectRoom(projectId));
      ack?.({ ok: true });
    });

    socket.on("board:leave", (projectId: string) => socket.leave(projectRoom(projectId)));
    // Rooms are cleaned up automatically by Socket.io on disconnect.
  });

  return { io, board };
}
