import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { AppError } from "../utils/AppError.js";

type RequestParts = {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
};

export function validate(schema: RequestParts) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.query) req.query = schema.query.parse(req.query) as Request["query"];
      if (schema.params) req.params = schema.params.parse(req.params) as Request["params"];
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new AppError(400, "Validation failed", err.flatten())
        );
        return;
      }
      next(err);
    }
  };
}
