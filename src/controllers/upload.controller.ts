import type { Request, Response } from "express";
import { getStorageMode, saveUpload } from "../services/upload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  const record = await saveUpload(req.file, req.user?.id);
  res.status(201).json({
    success: true,
    data: {
      ...record,
      storageMode: getStorageMode(),
    },
  });
});

export const storageInfo = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      mode: getStorageMode(),
      s3Optional: true,
    },
  });
});
