import type { Request, Response } from "express";
import * as roomService from "../services/room.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const rooms = await roomService.listRooms();
  res.json({ success: true, data: rooms });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const room = await roomService.getRoom(String(req.params.id));
  res.json({ success: true, data: room });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const room = await roomService.createRoom(req.body);
  res.status(201).json({ success: true, data: room });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const room = await roomService.updateRoom(String(req.params.id), req.body);
  res.json({ success: true, data: room });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await roomService.deleteRoom(String(req.params.id));
  res.json({ success: true, data: result });
});
