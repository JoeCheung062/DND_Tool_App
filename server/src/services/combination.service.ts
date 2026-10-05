import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateCombinationInput,
  UpdateCombinationInput,
} from "../validators/schemas.js";

const combinationInclude = {
  mainMaterial: true,
  connectMaterials: {
    include: { material: true },
  },
  zone1Material: true,
  zone2Material: true,
  zone3Material: true,
  zone4Material: true,
} as const;

const zoneKeys = [
  "zone1MaterialId",
  "zone2MaterialId",
  "zone3MaterialId",
  "zone4MaterialId",
] as const;

function shapeCombination<T extends {
  connectMaterials: { material: unknown }[];
}>(combination: T) {
  return {
    ...combination,
    connectMaterialList: combination.connectMaterials.map((c) => c.material),
  };
}

async function assertMaterialIds(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await prisma.material.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new AppError(400, "One or more material IDs are invalid");
  }
}

async function assertZoneImages(ids: string[]) {
  const unique = [...new Set(ids)];
  const found = await prisma.material.findMany({
    where: { id: { in: unique } },
    select: { id: true, type: true },
  });
  if (found.length !== unique.length) {
    throw new AppError(400, "One or more material IDs are invalid");
  }
  if (found.some((material) => material.type !== "IMAGE")) {
    throw new AppError(400, "Each environment pack zone must be an image");
  }
}

function zoneIdsOf(input: {
  zone1MaterialId?: string | null;
  zone2MaterialId?: string | null;
  zone3MaterialId?: string | null;
  zone4MaterialId?: string | null;
}) {
  return zoneKeys.map((key) => input[key]).filter((id): id is string => Boolean(id));
}

export async function listCombinations() {
  const rows = await prisma.combination.findMany({
    orderBy: { createdAt: "desc" },
    include: combinationInclude,
  });
  return rows.map(shapeCombination);
}

export async function getCombination(id: string) {
  const combination = await prisma.combination.findUnique({
    where: { id },
    include: combinationInclude,
  });
  if (!combination) throw new AppError(404, "Combination not found");
  return shapeCombination(combination);
}

export async function createCombination(input: CreateCombinationInput) {
  if (input.category === "ENVIRONMENT_PACK") {
    const zoneIds = zoneIdsOf(input);
    await assertZoneImages(zoneIds);
    const combination = await prisma.combination.create({
      data: {
        name: input.name,
        category: "ENVIRONMENT_PACK",
        zone1MaterialId: input.zone1MaterialId,
        zone2MaterialId: input.zone2MaterialId,
        zone3MaterialId: input.zone3MaterialId,
        zone4MaterialId: input.zone4MaterialId,
      },
      include: combinationInclude,
    });
    return shapeCombination(combination);
  }

  await assertMaterialIds([input.mainMaterialId!, ...input.connectMaterialIds]);
  if (input.connectMaterialIds.includes(input.mainMaterialId!)) {
    throw new AppError(400, "Main material cannot also be a connect material");
  }

  const combination = await prisma.combination.create({
    data: {
      name: input.name,
      category: "STANDARD",
      mainMaterialId: input.mainMaterialId,
      connectMaterials: {
        create: input.connectMaterialIds.map((materialId) => ({ materialId })),
      },
    },
    include: combinationInclude,
  });

  return shapeCombination(combination);
}

export async function updateCombination(id: string, input: UpdateCombinationInput) {
  const existing = await getCombination(id);
  const category = input.category ?? existing.category;

  if (category === "ENVIRONMENT_PACK") {
    const zones = {
      zone1MaterialId: input.zone1MaterialId ?? existing.zone1MaterialId,
      zone2MaterialId: input.zone2MaterialId ?? existing.zone2MaterialId,
      zone3MaterialId: input.zone3MaterialId ?? existing.zone3MaterialId,
      zone4MaterialId: input.zone4MaterialId ?? existing.zone4MaterialId,
    };
    if (zoneIdsOf(zones).length !== 4) {
      throw new AppError(400, "Choose an image for each zone");
    }
    await assertZoneImages(zoneIdsOf(zones));

    const combination = await prisma.$transaction(async (tx) => {
      await tx.combinationConnect.deleteMany({ where: { combinationId: id } });
      return tx.combination.update({
        where: { id },
        data: {
          name: input.name,
          category: "ENVIRONMENT_PACK",
          mainMaterialId: null,
          ...zones,
        },
        include: combinationInclude,
      });
    });
    return shapeCombination(combination);
  }

  const mainId = input.mainMaterialId ?? existing.mainMaterialId;
  const connectIds =
    input.connectMaterialIds ??
    existing.connectMaterials.map((link) => link.materialId);
  if (!mainId) throw new AppError(400, "Main material is required");
  await assertMaterialIds([mainId, ...connectIds]);
  if (connectIds.includes(mainId)) {
    throw new AppError(400, "Main material cannot also be a connect material");
  }

  const combination = await prisma.$transaction(async (tx) => {
    await tx.combinationConnect.deleteMany({ where: { combinationId: id } });
    if (connectIds.length > 0) {
      await tx.combinationConnect.createMany({
        data: connectIds.map((materialId) => ({ combinationId: id, materialId })),
      });
    }
    return tx.combination.update({
      where: { id },
      data: {
        name: input.name,
        category: "STANDARD",
        mainMaterialId: mainId,
        zone1MaterialId: null,
        zone2MaterialId: null,
        zone3MaterialId: null,
        zone4MaterialId: null,
      },
      include: combinationInclude,
    });
  });

  return shapeCombination(combination);
}

export async function deleteCombination(id: string) {
  await getCombination(id);
  await prisma.combination.delete({ where: { id } });
  return { id };
}
