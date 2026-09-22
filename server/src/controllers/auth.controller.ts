import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginAdmin(req.body);
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const admin = await authService.getAdminProfile(req.user!.id);
  res.json({ success: true, data: admin });
});

/** Public user registration is disabled — Users cannot log in. */
export const register = asyncHandler(async (_req: Request, _res: Response) => {
  throw new AppError(
    403,
    "User registration/login is disabled. Only Admin accounts can sign in. Create Users from the CMS."
  );
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await authService.listUsers();
  res.json({ success: true, data: users });
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUser(String(req.params.id));
  res.json({ success: true, data: user });
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.createUser(req.body);
  res.status(201).json({ success: true, data: user });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateUserProfile(String(req.params.id), req.body);
  res.json({ success: true, data: user });
});

export const removeUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.deleteUser(String(req.params.id));
  res.json({ success: true, data: result });
});

export const listAdmins = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await authService.listAdmins();
  res.json({ success: true, data: admins });
});

export const getAdmin = asyncHandler(async (req: Request, res: Response) => {
  const admin = await authService.getAdmin(String(req.params.id));
  res.json({ success: true, data: admin });
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const admin = await authService.createAdmin(req.body);
  res.status(201).json({ success: true, data: admin });
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  const admin = await authService.updateAdmin(String(req.params.id), req.body);
  res.json({ success: true, data: admin });
});

export const removeAdmin = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.deleteAdmin(String(req.params.id), req.user!.id);
  res.json({ success: true, data: result });
});
