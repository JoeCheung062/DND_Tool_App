import type { Request, Response } from "express";
import * as characterService from "../services/character.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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
  const character = await characterService.createCharacter(req.body);
  res.status(201).json({ success: true, data: character });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const character = await characterService.updateCharacter(
    String(req.params.id),
    req.body
  );
  res.json({ success: true, data: character });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await characterService.deleteCharacter(String(req.params.id));
  res.json({ success: true, data: result });
});
