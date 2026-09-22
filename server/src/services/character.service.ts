import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateCharacterInput,
  UpdateCharacterInput,
} from "../validators/schemas.js";

export async function listCharacters(userId?: string) {
  return prisma.character.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });
}

export async function getCharacter(id: string) {
  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });
  if (!character) throw new AppError(404, "Character not found");
  return character;
}

export async function createCharacter(input: CreateCharacterInput) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new AppError(404, "User not found");

  return prisma.character.create({
    data: {
      name: input.name,
      illustration: input.illustration,
      userId: input.userId,
    },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });
}

export async function updateCharacter(id: string, input: UpdateCharacterInput) {
  await getCharacter(id);

  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new AppError(404, "User not found");
  }

  return prisma.character.update({
    where: { id },
    data: input,
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });
}

export async function deleteCharacter(id: string) {
  await getCharacter(id);
  await prisma.character.delete({ where: { id } });
  return { id };
}
