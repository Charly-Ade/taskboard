import http from "node:http";
import express from "express";
import cors from "cors";
import { createSocketServer } from "./socket.js";
import { createRouter } from "./routes.js";

export async function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());
  const server = http.createServer(app);
  const { io, board } = await createSocketServer(server);
  app.get("/health", (_req, res) => res.json({ ok: true, port: process.env.PORT ?? 4000 }));
  app.use("/", createRouter(board));
  return { app, server, io };
}
