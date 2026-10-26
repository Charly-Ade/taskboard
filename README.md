# Real-Time Collaborative Task Board

Node.js + TypeScript + Express + Socket.io backend, React (Vite) frontend.
Multiple authenticated users see task changes and assignment notifications live.

## Run it

```bash
npm install
npm run dev:server     # API + Socket.io on :4000
npm run dev:client     # React app on :5173   (second terminal)
npm test               # server end-to-end smoke test
```

Open **two browser windows** at http://localhost:5173 (use a private window for the second so the
session isn't shared), sign in as `alice` and `bob` (password `password123` for all of
alice / bob / carol), open the same project and move or assign tasks.

## Namespace and room structure

| Thing | Name | Purpose |
|---|---|---|
| Namespace | `/board` | All task-board realtime traffic. Auth middleware lives here. |
| Room | `project:<projectId>` | Everyone viewing that project's board. `task:updated` is emitted only here. |
| Room | `user:<userId>` | Every tab/device of one user. `notification:new` is emitted only here. |

**Server → client events**

- `task:updated` (full task object) → room `project:<id>`
- `notification:new` (persisted notification) → room `user:<id>`

**Client → server events**

- `board:join(projectId, ack)` joins `project:<id>` (leaves any other project room first)
- `board:leave(projectId)` leaves the room

Rooms are left automatically on disconnect. The `user:<id>` room is joined on connection.

## How the requirements map to code

1. **Socket.io on Express** `server/src/socket.ts` attaches to the same `http.Server`, namespace `/board`.
2. **Rooms** `board:join` / `board:leave`; the React hook leaves on unmount and project switch.
3. **JWT auth** `board.use(...)` in `socket.ts` calls the *same* `verifyToken` as the REST middleware
   (`auth.ts`), rejects with `unauthorized: ...`, and sets `socket.data.user`.
4. **PATCH /tasks/:id** (`routes.ts`) validates with zod, updates, then `board.to("project:<id>").emit("task:updated")`.
5. **Notifications** on assignee change: persisted via the store, then emitted to `user:<assigneeId>`.
6. **Reconnection / resync** `client/src/useBoardSocket.ts`. On every `connect` it re-joins the room and calls
   `GET /sync?projectId=&since=` to fetch missed tasks and notifications. The cursor is the
   server's clock, not the browser's. The `disconnect` handler treats `'io server disconnect'`
   (the server closed us, no auto-reconnect, needs a manual `socket.connect()`) differently from
   `'transport close'` / `'ping timeout'` (Socket.io retries on its own).
7. **Status UI** `ConnectionStatus.tsx` shows connected / reconnecting / disconnected, the reason, and a Retry button
   when the server closed the connection.

Merging is idempotent: tasks are upserted by id and stale versions (`updatedAt` older than what we hold) are ignored,
so a task arriving by both socket and resync is harmless.

## Try the reconnection logic

- Stop the server (Ctrl+C), change tasks in the other window via REST, restart the server. The first window
  shows "Reconnecting…", then "Connected", and catches up.
- In DevTools → Network, set "Offline" for a moment and back.

## Stretch: Redis adapter (two instances)

Requires a local Redis (`docker run -p 6379:6379 redis`).

```bash
REDIS_URL=redis://localhost:6379 PORT=4000 npm run start -w server
REDIS_URL=redis://localhost:6379 PORT=4001 npm run start -w server
```

JWT secret and the data file are shared by default if both run from the same folder. Point client A at
`:4000` and client B at `:4001` (`VITE_API_URL=http://localhost:4001 npm run dev:client -- --port 5174`).
A PATCH through instance 4000 reaches the browser connected to 4001, because the adapter relays `board.to(room).emit`
through Redis pub/sub.

> Caveat: instances share state here only through the JSON file, which is fine for a demo but not for production.
> Use a real database when scaling out.

## Stretch: connection state recovery

Enabled in single-instance mode (2 minute window). `@socket.io/redis-adapter` does not support it, so it's turned off
when `REDIS_URL` is set (the Redis Streams adapter would be needed). The REST resync runs regardless, so
correctness doesn't depend on recovery.

## Notes

- Storage is a small JSON file (`server/data.json`) behind `store.ts`, so the project runs with zero setup. Swap in
  your existing DB layer there.
- To reuse your existing REST API: keep `verifyToken` and the `JWT_SECRET` the same, and mount the broadcast
  calls from `routes.ts` in your own PATCH handler.
- Set `JWT_SECRET` in any real environment.
