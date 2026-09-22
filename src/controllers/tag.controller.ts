import type { Request, Response } from "express";
import * as tagService from "../services/tag.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const tags = await tagService.listTags();
  res.json({ success: true, data: tags });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.getTag(String(req.params.id));
  res.json({ success: true, data: tag });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.createTag(req.body);
  res.status(201).json({ success: true, data: tag });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.updateTag(String(req.params.id), req.body);
  res.json({ success: true, data: tag });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await tagService.deleteTag(String(req.params.id));
  res.json({ success: true, data: result });
});
