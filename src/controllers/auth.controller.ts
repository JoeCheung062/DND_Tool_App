import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerUser(req.body);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body);
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUserProfile(req.user!.id);
  res.json({ success: true, data: user });
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const users = await authService.listUsers();
  res.json({ success: true, data: users });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUser(String(req.params.id));
  res.json({ success: true, data: user });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.createUser(req.body);
  res.status(201).json({ success: true, data: user });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateUserProfile(String(req.params.id), req.body);
  res.json({ success: true, data: user });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.deleteUser(String(req.params.id));
  res.json({ success: true, data: result });
});
