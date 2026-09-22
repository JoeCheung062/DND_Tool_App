import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "Route not found"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: err.flatten(),
    });
  }

  // Multer / upload errors
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: `File too large. Max ${env.MAX_FILE_SIZE_MB}MB`,
      });
    }
  }

  // Prisma unreachable DB / init errors
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name?: string }).name === "PrismaClientInitializationError"
  ) {
    return res.status(503).json({
      success: false,
      message:
        "Cannot reach PostgreSQL at localhost:5432. Start it with `npm run db:up` (Docker), then `npx prisma migrate deploy` and `npm run db:seed`.",
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: env.NODE_ENV === "production" ? "Internal server error" : String(err),
  });
}
