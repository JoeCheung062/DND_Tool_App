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

function parseBool(value: unknown): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function materialPayloadFromRequest(req: Request) {
  return {
    type: req.body.type,
    name: req.body.name,
    assetUrl: req.body.assetUrl || undefined,
    general: parseBool(req.body.general),
    npc: parseBool(req.body.npc),
    campaignIds: parseIdList(req.body.campaignIds) ?? [],
    tagIds: parseIdList(req.body.tagIds) ?? [],
  };
}

function uploadedFile(req: Request, field: "file" | "characterArt") {
  const files = req.files as { file?: Express.Multer.File[]; characterArt?: Express.Multer.File[] } | undefined;
  return files?.[field]?.[0];
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const type =
    typeof req.query.type === "string"
      ? (req.query.type as "IMAGE" | "EFFECT" | "SOUND")
      : undefined;
  const campaignId =
    typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const tagId = typeof req.query.tagId === "string" ? req.query.tagId : undefined;
  const includeGeneral =
    req.query.includeGeneral === "1" || req.query.includeGeneral === "true";

  const materials = await materialService.listMaterials({
    type,
    campaignId,
    tagId,
    includeGeneral,
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
  const avatar = uploadedFile(req, "file") ?? req.file;
  if (avatar) {
    const uploaded = await saveUpload(avatar, req.user?.id);
    assetUrl = uploaded.url;
  }

  if (!assetUrl) {
    throw new AppError(
      400,
      "Upload a file (field name \"file\") or provide assetUrl"
    );
  }

  let characterArtUrl: string | null | undefined;
  const art = uploadedFile(req, "characterArt");
  if (art) {
    const uploaded = await saveUpload(art, req.user?.id);
    characterArtUrl = uploaded.url;
  }

  const material = await materialService.createMaterial({
    ...input,
    assetUrl,
    ...(characterArtUrl ? { characterArtUrl } : {}),
  });
  res.status(201).json({ success: true, data: material });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const raw = {
    type: req.body.type || undefined,
    name: req.body.name || undefined,
    assetUrl: req.body.assetUrl || undefined,
    general: parseBool(req.body.general),
    npc: parseBool(req.body.npc),
    campaignIds: parseIdList(req.body.campaignIds),
    tagIds: parseIdList(req.body.tagIds),
  };
  const input = updateMaterialSchema.parse(raw);

  const data = { ...input };
  const avatar = uploadedFile(req, "file") ?? req.file;
  if (avatar) {
    const uploaded = await saveUpload(avatar, req.user?.id);
    data.assetUrl = uploaded.url;
  }
  const art = uploadedFile(req, "characterArt");
  if (art) {
    const uploaded = await saveUpload(art, req.user?.id);
    data.characterArtUrl = uploaded.url;
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
