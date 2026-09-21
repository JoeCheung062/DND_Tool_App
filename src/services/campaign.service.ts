import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateCampaignInput,
  CreateCharacterInput,
  UpdateCampaignInput,
} from "../validators/schemas.js";

export async function createCampaign(ownerId: string, input: CreateCampaignInput) {
  return prisma.campaign.create({
    data: {
      name: input.name,
      description: input.description,
      ownerId,
      members: {
        create: {
          userId: ownerId,
          role: "DM",
        },
      },
    },
    include: {
      members: true,
    },
  });
}

export async function listCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, username: true } },
      _count: { select: { members: true, characters: true } },
    },
  });
}

export async function getCampaign(id: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      owner: { select: { id: true, username: true, avatarUrl: true } },
      members: {
        include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      },
      characters: true,
      sessions: { orderBy: { startedAt: "desc" }, take: 10 },
    },
  });

  if (!campaign) {
    throw new AppError(404, "Campaign not found");
  }

  return campaign;
}

export async function updateCampaign(
  id: string,
  userId: string,
  input: UpdateCampaignInput
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerId: userId },
  });

  if (!campaign) {
    throw new AppError(404, "Campaign not found or not owned by you");
  }

  return prisma.campaign.update({
    where: { id },
    data: input,
  });
}

export async function createCharacter(ownerId: string, input: CreateCharacterInput) {
  if (input.campaignId) {
    const membership = await prisma.campaignMember.findFirst({
      where: { campaignId: input.campaignId, userId: ownerId },
    });
    const owned = await prisma.campaign.findFirst({
      where: { id: input.campaignId, ownerId },
    });
    if (!membership && !owned) {
      throw new AppError(403, "Not a member of this campaign");
    }
  }

  return prisma.character.create({
    data: {
      name: input.name,
      className: input.className,
      level: input.level ?? 1,
      race: input.race,
      avatarUrl: input.avatarUrl,
      stats: input.stats as Prisma.InputJsonValue | undefined,
      campaignId: input.campaignId,
      ownerId,
    },
  });
}

export async function listCharacters(ownerId: string) {
  return prisma.character.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });
}
