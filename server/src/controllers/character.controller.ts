import type { Request, Response } from "express";
import * as characterService from "../services/character.service.js";
import { saveUpload } from "../services/upload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createCharacterSchema,
  updateCharacterSchema,
} from "../validators/schemas.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const userId =
    typeof req.query.userId === "string" ? req.query.userId : undefined;
  const characters = await characterService.listCharacters(userId);
  res.json({ success: true, data: characters });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const character = await characterService.getCharacter(String(req.params.id));
  res.json({ success: true, data: character });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = createCharacterSchema.parse({
    name: req.body.name,
    userId: req.body.userId,
    illustration: req.body.illustration || undefined,
  });

  let illustration = input.illustration;
  if (req.file) {
    const uploaded = await saveUpload(req.file, req.user?.id, {
      imagesOnly: true,
    });
    illustration = uploaded.url;
  }

  const character = await characterService.createCharacter({
    ...input,
    illustration,
  });
  res.status(201).json({ success: true, data: character });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = updateCharacterSchema.parse({
    name: req.body.name || undefined,
    userId: req.body.userId || undefined,
    illustration:
      req.body.illustration === ""
        ? null
        : req.body.illustration || undefined,
  });

  const data = { ...input };
  if (req.file) {
    const uploaded = await saveUpload(req.file, req.user?.id, {
      imagesOnly: true,
    });
    data.illustration = uploaded.url;
  }

  const character = await characterService.updateCharacter(
    String(req.params.id),
    data
  );
  res.json({ success: true, data: character });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await characterService.deleteCharacter(String(req.params.id));
  res.json({ success: true, data: result });
});
