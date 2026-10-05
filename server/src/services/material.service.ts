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
  /** With campaignId, also include materials marked general */
  includeGeneral?: boolean;
}) {
  const campaignFilter = filters?.campaignId
    ? filters.includeGeneral
      ? {
          OR: [
            { campaignPresets: { some: { campaignId: filters.campaignId } } },
            { general: true },
          ],
        }
      : { campaignPresets: { some: { campaignId: filters.campaignId } } }
    : {};

  const materials = await prisma.material.findMany({
    where: {
      ...(filters?.type ? { type: filters.type } : {}),
      ...campaignFilter,
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
      general: input.general ?? false,
      npc: input.npc ?? false,
      assetUrl: input.assetUrl,
      ...(input.characterArtUrl ? { characterArtUrl: input.characterArtUrl } : {}),
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
        ...(input.general !== undefined ? { general: input.general } : {}),
        ...(input.npc !== undefined ? { npc: input.npc } : {}),
        ...(input.characterArtUrl !== undefined ? { characterArtUrl: input.characterArtUrl } : {}),
      },
      include: materialInclude,
    });
  });

  return shapeMaterial(material);
}

export async function deleteMaterial(id: string) {
  await getMaterial(id);
  await prisma.$transaction(async (tx) => {
    const referenced = await tx.combination.findMany({
      where: {
        OR: [
          { mainMaterialId: id },
          { zone1MaterialId: id },
          { zone2MaterialId: id },
          { zone3MaterialId: id },
          { zone4MaterialId: id },
        ],
      },
    });
    for (const combination of referenced) {
      const cleared = {
        ...(combination.mainMaterialId === id ? { mainMaterialId: null } : {}),
        ...(combination.zone1MaterialId === id ? { zone1MaterialId: null } : {}),
        ...(combination.zone2MaterialId === id ? { zone2MaterialId: null } : {}),
        ...(combination.zone3MaterialId === id ? { zone3MaterialId: null } : {}),
        ...(combination.zone4MaterialId === id ? { zone4MaterialId: null } : {}),
      };
      const zoneIds = [
        combination.zone1MaterialId === id ? null : combination.zone1MaterialId,
        combination.zone2MaterialId === id ? null : combination.zone2MaterialId,
        combination.zone3MaterialId === id ? null : combination.zone3MaterialId,
        combination.zone4MaterialId === id ? null : combination.zone4MaterialId,
      ];
      const mainId = combination.mainMaterialId === id ? null : combination.mainMaterialId;
      const empty =
        (combination.category === "STANDARD" && !mainId) ||
        (combination.category === "ENVIRONMENT_PACK" && zoneIds.every((zoneId) => !zoneId));
      if (empty) {
        await tx.combination.delete({ where: { id: combination.id } });
      } else {
        await tx.combination.update({ where: { id: combination.id }, data: cleared });
      }
    }
    await tx.material.delete({ where: { id } });
  });
  return { id };
}
