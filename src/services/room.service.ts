import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { CreateRoomInput, UpdateRoomInput } from "../validators/schemas.js";

export async function listRooms() {
  return prisma.room.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new AppError(404, "Room not found");
  return room;
}

export async function createRoom(input: CreateRoomInput) {
  return prisma.room.create({ data: { name: input.name } });
}

export async function updateRoom(id: string, input: UpdateRoomInput) {
  await getRoom(id);
  return prisma.room.update({ where: { id }, data: input });
}

export async function deleteRoom(id: string) {
  await getRoom(id);
  await prisma.room.delete({ where: { id } });
  return { id };
}
