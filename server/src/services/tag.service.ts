import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { CreateTagInput, UpdateTagInput } from "../validators/schemas.js";

export async function listTags() {
  return prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { materials: true } } },
  });
}

export async function getTag(id: string) {
  const tag = await prisma.tag.findUnique({
    where: { id },
    include: {
      materials: { include: { material: true } },
    },
  });
  if (!tag) throw new AppError(404, "Tag not found");
  return tag;
}

export async function createTag(input: CreateTagInput) {
  const existing = await prisma.tag.findUnique({ where: { name: input.name } });
  if (existing) throw new AppError(409, "Tag name already exists");
  return prisma.tag.create({ data: { name: input.name } });
}

export async function updateTag(id: string, input: UpdateTagInput) {
  await getTag(id);
  if (input.name) {
    const existing = await prisma.tag.findFirst({
      where: { name: input.name, NOT: { id } },
    });
    if (existing) throw new AppError(409, "Tag name already exists");
  }
  return prisma.tag.update({ where: { id }, data: input });
}

export async function deleteTag(id: string) {
  await getTag(id);
  await prisma.tag.delete({ where: { id } });
  return { id };
}
