import type { Request, Response } from "express";
import * as combinationService from "../services/combination.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const combinations = await combinationService.listCombinations();
  res.json({ success: true, data: combinations });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const combination = await combinationService.getCombination(
    String(req.params.id)
  );
  res.json({ success: true, data: combination });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const combination = await combinationService.createCombination(req.body);
  res.status(201).json({ success: true, data: combination });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const combination = await combinationService.updateCombination(
    String(req.params.id),
    req.body
  );
  res.json({ success: true, data: combination });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await combinationService.deleteCombination(
    String(req.params.id)
  );
  res.json({ success: true, data: result });
});
