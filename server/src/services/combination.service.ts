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
} as const;

function shapeCombination<T extends {
  connectMaterials: { material: unknown }[];
}>(combination: T) {
  return {
    ...combination,
    connectMaterialList: combination.connectMaterials.map((c) => c.material),
  };
}

async function assertMaterialIds(ids: string[]) {
  if (ids.length === 0) return;
  const found = await prisma.material.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new AppError(400, "One or more material IDs are invalid");
  }
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
  await assertMaterialIds([input.mainMaterialId, ...input.connectMaterialIds]);

  if (input.connectMaterialIds.includes(input.mainMaterialId)) {
    throw new AppError(400, "Main material cannot also be a connect material");
  }

  const combination = await prisma.combination.create({
    data: {
      name: input.name,
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

  const mainId = input.mainMaterialId ?? existing.mainMaterialId;
  const connectIds = input.connectMaterialIds;

  if (input.mainMaterialId || connectIds) {
    const toCheck = [
      ...(input.mainMaterialId ? [input.mainMaterialId] : []),
      ...(connectIds ?? []),
    ];
    await assertMaterialIds(toCheck);
  }

  if (connectIds?.includes(mainId)) {
    throw new AppError(400, "Main material cannot also be a connect material");
  }

  const combination = await prisma.$transaction(async (tx) => {
    if (connectIds) {
      await tx.combinationConnect.deleteMany({ where: { combinationId: id } });
      if (connectIds.length > 0) {
        await tx.combinationConnect.createMany({
          data: connectIds.map((materialId) => ({
            combinationId: id,
            materialId,
          })),
        });
      }
    }

    return tx.combination.update({
      where: { id },
      data: {
        name: input.name,
        mainMaterialId: input.mainMaterialId,
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
