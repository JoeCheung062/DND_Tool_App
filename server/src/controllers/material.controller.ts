import type { Request, Response } from "express";
import * as materialService from "../services/material.service.js";
import { saveUpload } from "../services/upload.service.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createMaterialSchema,
  updateMaterialSchema,
} from "../validators/schemas.js";

function parseIdList(value: unknown): string[] | undefined {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through — comma-separated
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

function materialPayloadFromRequest(req: Request) {
  return {
    type: req.body.type,
    name: req.body.name,
    assetUrl: req.body.assetUrl || undefined,
    campaignIds: parseIdList(req.body.campaignIds) ?? [],
    tagIds: parseIdList(req.body.tagIds) ?? [],
  };
}

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
  const raw = materialPayloadFromRequest(req);
  const input = createMaterialSchema.parse(raw);

  let assetUrl = input.assetUrl;
  if (req.file) {
    const uploaded = await saveUpload(req.file, req.user?.id);
    assetUrl = uploaded.url;
  }

  if (!assetUrl) {
    throw new AppError(
      400,
      "Upload a file (field name \"file\") or provide assetUrl"
    );
  }

  const material = await materialService.createMaterial({
    ...input,
    assetUrl,
  });
  res.status(201).json({ success: true, data: material });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const raw = {
    type: req.body.type || undefined,
    name: req.body.name || undefined,
    assetUrl: req.body.assetUrl || undefined,
    campaignIds: parseIdList(req.body.campaignIds),
    tagIds: parseIdList(req.body.tagIds),
  };
  const input = updateMaterialSchema.parse(raw);

  const data = { ...input };
  if (req.file) {
    const uploaded = await saveUpload(req.file, req.user?.id);
    data.assetUrl = uploaded.url;
  }

  const material = await materialService.updateMaterial(
    String(req.params.id),
    data
  );
  res.json({ success: true, data: material });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await materialService.deleteMaterial(String(req.params.id));
  res.json({ success: true, data: result });
});
