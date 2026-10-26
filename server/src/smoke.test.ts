// End-to-end smoke test: two authenticated clients, rooms, notifications, auth rejection, resync.
process.env.NO_PERSIST = "1";
import assert from "node:assert/strict";
import { io as connect, type Socket } from "socket.io-client";
import { createApp } from "./app.js";

const { server, io } = await createApp();
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;
const base = `http://localhost:${port}`;

const api = async (path: string, token?: string, init: RequestInit = {}) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: res.status, body: await res.json() as any };
};
const login = async (u: string) => (await api("/auth/login", undefined, { method: "POST", body: JSON.stringify({ username: u, password: "password123" }) })).body;
const sock = (token?: string) => connect(`${base}/board`, { auth: { token }, transports: ["websocket"], reconnection: false });
const once = <T,>(s: Socket, ev: string, ms = 1500) =>
  new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms); s.once(ev, (d: T) => { clearTimeout(t); res(d); }); });
const silent = (s: Socket, ev: string, ms = 400) =>
  new Promise<boolean>((res) => { let got = false; s.once(ev, () => (got = true)); setTimeout(() => res(!got), ms); });
const join = (s: Socket, id: string) => new Promise<any>((r) => s.emit("board:join", id, r));

const alice = await login("alice"), bob = await login("bob"), carol = await login("carol");

// 1. unauthenticated sockets are rejected
const bad = sock();
const err = await once<Error>(bad, "connect_error");
assert.match(err.message, /unauthorized/);
const bad2 = sock("garbage");
assert.match((await once<Error>(bad2, "connect_error")).message, /unauthorized/);
console.log("✓ rejects missing/invalid JWT");

// 2. rooms + scoped broadcast
const a = sock(alice.token), b = sock(bob.token), c = sock(carol.token), b2 = sock(bob.token);
await Promise.all([a, b, c, b2].map((s) => once(s, "connect")));
assert.equal((await join(a, "p1")).ok, true);
assert.equal((await join(b, "p1")).ok, true);
assert.equal((await join(c, "p2")).ok, true); // different project
const gotB = once<any>(b, "task:updated");
const quietC = silent(c, "task:updated");
const patch = await api("/tasks/t1", alice.token, { method: "PATCH", body: JSON.stringify({ status: "doing" }) });
assert.equal(patch.status, 200);
assert.equal((await gotB).status, "doing");
assert.equal(await quietC, true);
console.log("✓ task:updated reaches only the project room");

// 3. validation
assert.equal((await api("/tasks/t1", alice.token, { method: "PATCH", body: JSON.stringify({ status: "nope" }) })).status, 400);
assert.equal((await api("/tasks/zzz", alice.token, { method: "PATCH", body: JSON.stringify({ status: "done" }) })).status, 404);
assert.equal((await api("/tasks/t1", undefined, { method: "PATCH", body: "{}" })).status, 401);
console.log("✓ REST validation + auth");

// 4. notification reaches every tab of the assignee, persisted
const n1 = once<any>(b, "notification:new"), n2 = once<any>(b2, "notification:new");
await api("/tasks/t1", alice.token, { method: "PATCH", body: JSON.stringify({ assigneeId: "u2" }) });
assert.equal((await n1).userId, "u2"); assert.equal((await n2).type, "task:assigned");
assert.equal((await api("/notifications", bob.token)).body.length, 1);
console.log("✓ notification:new hits all of the user's tabs and is persisted");

// 5. leave room
a.emit("board:leave", "p1");
await new Promise((r) => setTimeout(r, 100));
const quietA = silent(a, "task:updated");
await api("/tasks/t2", bob.token, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
assert.equal(await quietA, true);
console.log("✓ board:leave stops updates");

// 6. resync: miss updates while "offline", fetch since last timestamp
const { body: first } = await api("/projects/p1/tasks", bob.token);
const since = first.serverTime;
await api("/tasks/t3", alice.token, { method: "PATCH", body: JSON.stringify({ title: "Write better copy" }) });
await api("/tasks/t3", alice.token, { method: "PATCH", body: JSON.stringify({ assigneeId: "u2" }) });
const sync = await api(`/sync?projectId=p1&since=${encodeURIComponent(since)}`, bob.token);
assert.equal(sync.body.tasks.length, 1);
assert.equal(sync.body.tasks[0].assigneeId, "u2");
assert.equal(sync.body.notifications.length, 1);
console.log("✓ /sync returns missed tasks + notifications");

[a, b, c, b2, bad, bad2].forEach((s) => s.close());
io.close(); server.close();
console.log("\nAll checks passed");
process.exit(0);
