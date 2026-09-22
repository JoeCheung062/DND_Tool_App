import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { CreateRoomInput, UpdateRoomInput } from "../validators/schemas.js";

const roomInclude = {
  campaign: { select: { id: true, name: true } },
} as const;

export async function listRooms() {
  return prisma.room.findMany({
    orderBy: { createdAt: "desc" },
    include: roomInclude,
  });
}

export async function getRoom(id: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    include: roomInclude,
  });
  if (!room) throw new AppError(404, "Room not found");
  return room;
}

async function assertCampaign(campaignId?: string | null) {
  if (!campaignId) return;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) throw new AppError(404, "Script (campaign) not found");
}

export async function createRoom(input: CreateRoomInput) {
  await assertCampaign(input.campaignId);
  return prisma.room.create({
    data: {
      name: input.name,
      campaignId: input.campaignId,
    },
    include: roomInclude,
  });
}

export async function updateRoom(id: string, input: UpdateRoomInput) {
  await getRoom(id);
  if (input.campaignId !== undefined) {
    await assertCampaign(input.campaignId);
  }
  return prisma.room.update({
    where: { id },
    data: input,
    include: roomInclude,
  });
}

export async function deleteRoom(id: string) {
  await getRoom(id);
  await prisma.room.delete({ where: { id } });
  return { id };
}
