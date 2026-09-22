import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthAdmin } from "../types/auth.js";

type JwtPayload = AuthAdmin & { iat?: number; exp?: number };

export function signToken(admin: AuthAdmin): string {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      accountType: "admin" as const,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );
}

export function verifyToken(token: string): AuthAdmin {
  const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  if (payload.accountType && payload.accountType !== "admin") {
    throw new Error("User accounts cannot sign in");
  }
  return {
    id: payload.id,
    email: payload.email,
    username: payload.username,
    role: payload.role,
    accountType: "admin",
  };
}
