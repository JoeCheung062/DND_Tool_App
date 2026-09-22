import type { Request, Response } from "express";
import * as adminService from "../services/admin.service.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const overview = asyncHandler(async (_req: Request, res: Response) => {
  const data = await adminService.getDataOverview();
  res.json({ success: true, data });
});

export const tables = asyncHandler(async (_req: Request, res: Response) => {
  const data = await adminService.listSqlTables();
  res.json({ success: true, data });
});

export const describe = asyncHandler(async (req: Request, res: Response) => {
  const table = String(req.params.table);
  const data = await adminService.describeTable(table);
  if (!data) throw new AppError(404, `Table not found: ${table}`);
  res.json({ success: true, data });
});
