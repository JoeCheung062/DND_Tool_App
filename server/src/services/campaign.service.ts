import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "../validators/schemas.js";

const campaignInclude = {
  materialPresets: {
    include: {
      material: {
        include: {
          tags: { include: { tag: true } },
        },
      },
    },
  },
} as const;

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { materialPresets: true } },
    },
  });
}

export async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: campaignInclude,
  });
  if (!campaign) throw new AppError(404, "Campaign not found");
  return campaign;
}

export async function createCampaign(input: CreateCampaignInput) {
  return prisma.campaign.create({ data: { name: input.name } });
}

export async function updateCampaign(id: string, input: UpdateCampaignInput) {
  await getCampaign(id);
  return prisma.campaign.update({ where: { id }, data: input });
}

export async function deleteCampaign(id: string) {
  await getCampaign(id);
  await prisma.campaign.delete({ where: { id } });
  return { id };
}
