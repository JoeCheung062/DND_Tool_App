import type { Request, Response } from "express";
import * as materialService from "../services/material.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const type =
    typeof req.query.type === "string"
      ? (req.query.type as "IMAGE" | "EFFECT" | "SOUND")
      : undefined;
  const campaignId =
    typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const tagId = typeof req.query.tagId === "string" ? req.query.tagId : undefined;

  const materials = await materialService.listMaterials({
    type,
    campaignId,
    tagId,
  });
  res.json({ success: true, data: materials });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const material = await materialService.getMaterial(String(req.params.id));
  res.json({ success: true, data: material });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const material = await materialService.createMaterial(req.body);
  res.status(201).json({ success: true, data: material });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const material = await materialService.updateMaterial(
    String(req.params.id),
    req.body
  );
  res.json({ success: true, data: material });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await materialService.deleteMaterial(String(req.params.id));
  res.json({ success: true, data: result });
});
