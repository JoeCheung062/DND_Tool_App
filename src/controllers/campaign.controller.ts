import type { Request, Response } from "express";
import * as campaignService from "../services/campaign.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const campaigns = await campaignService.listCampaigns();
  res.json({ success: true, data: campaigns });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.getCampaign(String(req.params.id));
  res.json({ success: true, data: campaign });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.createCampaign(req.body);
  res.status(201).json({ success: true, data: campaign });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.updateCampaign(
    String(req.params.id),
    req.body
  );
  res.json({ success: true, data: campaign });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await campaignService.deleteCampaign(String(req.params.id));
  res.json({ success: true, data: result });
});
