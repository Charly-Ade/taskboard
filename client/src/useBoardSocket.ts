import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, api } from "./api";
import type { AppNotification, ConnStatus, Task } from "./types";

interface Options {
  token: string;
  projectId: string;
  onTasks: (tasks: Task[]) => void;                 // upsert by id
  onNotifications: (items: AppNotification[]) => void;
  onAuthError: () => void;
}

/**
 * Owns the socket lifecycle for one project board.
 *
 * Resync pattern: on EVERY 'connect' (first connect and every reconnect) we
 *   1. join the project room (rooms are lost when a socket disconnects)
 *   2. fetch /sync?since=<lastSeen> and merge whatever we missed
 * Joining before fetching means nothing can slip through the gap between the
 * two; duplicates are harmless because we upsert by id and ignore stale versions.
 */
export function useBoardSocket({ token, projectId, onTasks, onNotifications, onAuthError }: Options) {
  const [status, setStatus] = useState<ConnStatus>("reconnecting");
  const [lastReason, setLastReason] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastSeen = useRef<string>(new Date(0).toISOString()); // server clock, never Date.now()
  const cb = useRef({ onTasks, onNotifications, onAuthError });
  cb.current = { onTasks, onNotifications, onAuthError };

  useEffect(() => {
    let cancelled = false;
    lastSeen.current = new Date(0).toISOString();
    setStatus("reconnecting");

    const bump = (iso: string) => { if (iso > lastSeen.current) lastSeen.current = iso; };

    const socket = io(`${API_URL}/board`, {
      auth: (cbAuth) => cbAuth({ token }),   // re-read on each reconnect attempt
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const resync = async () => {
      try {
        const since = lastSeen.current;
        const data = await api.sync(token, projectId, since);
        if (cancelled) return;
        if (data.tasks.length) { cb.current.onTasks(data.tasks); data.tasks.forEach((t) => bump(t.updatedAt)); }
        if (data.notifications.length) { cb.current.onNotifications(data.notifications); data.notifications.forEach((n) => bump(n.createdAt)); }
        bump(data.serverTime);
      } catch (e: any) {
        if (e?.status === 401) cb.current.onAuthError();
      }
    };

    socket.on("connect", () => {
      setStatus("connected");
      setLastReason(null);
      socket.emit("board:join", projectId, (res: { ok: boolean }) => { if (res?.ok) void resync(); });
    });

    socket.on("disconnect", (reason) => {
      setLastReason(reason);
      if (reason === "io server disconnect") {
        // The SERVER deliberately closed us (e.g. kicked / auth revoked).
        // Socket.io will NOT auto-reconnect in this case - we must decide.
        setStatus("disconnected");
      } else {
        // 'transport close', 'ping timeout', 'transport error' -> Socket.io retries by itself.
        // 'io client disconnect' means we called socket.disconnect() on purpose (cleanup).
        setStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
      }
    });

    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.io.on("reconnect_failed", () => setStatus("disconnected"));

    socket.on("connect_error", (err) => {
      if (err.message.startsWith("unauthorized")) { socket.disconnect(); setStatus("disconnected"); cb.current.onAuthError(); }
      else setStatus("reconnecting");
    });

    socket.on("task:updated", (task: Task) => { cb.current.onTasks([task]); bump(task.updatedAt); });
    socket.on("notification:new", (n: AppNotification) => { cb.current.onNotifications([n]); bump(n.createdAt); });

    return () => {
      cancelled = true;
      socket.emit("board:leave", projectId);
      socket.disconnect();
    };
  }, [token, projectId]);

  const reconnectNow = () => socketRef.current?.connect();
  return { status, lastReason, reconnectNow };
}
