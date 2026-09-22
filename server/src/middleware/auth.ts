import type { NextFunction, Request, Response } from "express";
import type { AdminRole } from "@prisma/client";
import { verifyToken } from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or invalid Authorization header"));
  }

  try {
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  try {
    req.user = verifyToken(header.slice(7));
  } catch {
    // ignore invalid optional tokens
  }
  next();
}

export function requireAdminRoles(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient admin permissions"));
    }
    next();
  };
}

/** @deprecated use requireAdminRoles */
export const requireRoles = requireAdminRoles;
