import type { Request, Response } from "express";
import * as campaignService from "../services/campaign.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.createCampaign(req.user!.id, req.body);
  res.status(201).json({ success: true, data: campaign });
});

export const listCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const campaigns = await campaignService.listCampaigns(req.user!.id);
  res.json({ success: true, data: campaigns });
});

export const getCampaign = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const campaign = await campaignService.getCampaign(id, req.user!.id);
  res.json({ success: true, data: campaign });
});

export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const campaign = await campaignService.updateCampaign(
    id,
    req.user!.id,
    req.body
  );
  res.json({ success: true, data: campaign });
});

export const createCharacter = asyncHandler(async (req: Request, res: Response) => {
  const character = await campaignService.createCharacter(req.user!.id, req.body);
  res.status(201).json({ success: true, data: character });
});

export const listCharacters = asyncHandler(async (req: Request, res: Response) => {
  const characters = await campaignService.listCharacters(req.user!.id);
  res.json({ success: true, data: characters });
});
