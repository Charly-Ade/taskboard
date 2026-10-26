import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "./types.js";

export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export const signToken = (p: JwtPayload) => jwt.sign(p, JWT_SECRET, { expiresIn: "8h" });
export const verifyToken = (token: string) => jwt.verify(token, JWT_SECRET) as JwtPayload;

declare module "express-serve-static-core" {
  interface Request { user?: { id: string; name: string } }
}

// REST middleware - uses the SAME verifyToken as the socket middleware.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const p = verifyToken(token);
    req.user = { id: p.sub, name: p.name };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
