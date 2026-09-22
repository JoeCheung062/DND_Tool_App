import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateMaterialInput,
  UpdateMaterialInput,
} from "../validators/schemas.js";

const materialInclude = {
  campaignPresets: {
    include: { campaign: { select: { id: true, name: true } } },
  },
  tags: {
    include: { tag: true },
  },
} as const;

async function assertCampaignIds(ids: string[]) {
  if (ids.length === 0) return;
  const found = await prisma.campaign.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new AppError(400, "One or more campaignIds are invalid");
  }
}

async function assertTagIds(ids: string[]) {
  if (ids.length === 0) return;
  const found = await prisma.tag.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new AppError(400, "One or more tagIds are invalid");
  }
}

function shapeMaterial<T extends {
  campaignPresets: { campaign: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string } }[];
}>(material: T) {
  return {
    ...material,
    campaigns: material.campaignPresets.map((p) => p.campaign),
    tagList: material.tags.map((t) => t.tag),
  };
}

export async function listMaterials(filters?: {
  type?: "IMAGE" | "EFFECT" | "SOUND";
  campaignId?: string;
  tagId?: string;
}) {
  const materials = await prisma.material.findMany({
    where: {
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.campaignId
        ? { campaignPresets: { some: { campaignId: filters.campaignId } } }
        : {}),
      ...(filters?.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: materialInclude,
  });
  return materials.map(shapeMaterial);
}

export async function getMaterial(id: string) {
  const material = await prisma.material.findUnique({
    where: { id },
    include: materialInclude,
  });
  if (!material) throw new AppError(404, "Material not found");
  return shapeMaterial(material);
}

export async function createMaterial(
  input: CreateMaterialInput & { assetUrl: string }
) {
  await assertCampaignIds(input.campaignIds);
  await assertTagIds(input.tagIds);

  const material = await prisma.material.create({
    data: {
      type: input.type,
      name: input.name,
      assetUrl: input.assetUrl,
      campaignPresets: {
        create: input.campaignIds.map((campaignId) => ({ campaignId })),
      },
      tags: {
        create: input.tagIds.map((tagId) => ({ tagId })),
      },
    },
    include: materialInclude,
  });

  return shapeMaterial(material);
}

export async function updateMaterial(id: string, input: UpdateMaterialInput) {
  await getMaterial(id);

  if (input.campaignIds) await assertCampaignIds(input.campaignIds);
  if (input.tagIds) await assertTagIds(input.tagIds);

  const material = await prisma.$transaction(async (tx) => {
    if (input.campaignIds) {
      await tx.materialCampaignPreset.deleteMany({ where: { materialId: id } });
      if (input.campaignIds.length > 0) {
        await tx.materialCampaignPreset.createMany({
          data: input.campaignIds.map((campaignId) => ({
            materialId: id,
            campaignId,
          })),
        });
      }
    }

    if (input.tagIds) {
      await tx.materialTag.deleteMany({ where: { materialId: id } });
      if (input.tagIds.length > 0) {
        await tx.materialTag.createMany({
          data: input.tagIds.map((tagId) => ({ materialId: id, tagId })),
        });
      }
    }

    return tx.material.update({
      where: { id },
      data: {
        type: input.type,
        name: input.name,
        assetUrl: input.assetUrl,
      },
      include: materialInclude,
    });
  });

  return shapeMaterial(material);
}

export async function deleteMaterial(id: string) {
  await getMaterial(id);
  await prisma.material.delete({ where: { id } });
  return { id };
}
