import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { signToken } from "../utils/jwt.js";
import type {
  CreateUserInput,
  LoginInput,
  RegisterInput,
  UpdateUserProfileInput,
} from "../validators/schemas.js";

const userSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
  });

  if (existing) {
    throw new AppError(409, "Email or username already in use");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash,
      displayName: input.displayName ?? input.username,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
    },
    select: userSelect,
  });

  const token = signToken({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });

  return { user, token };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    token,
  };
}

export async function listUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...userSelect,
      characters: true,
    },
  });
  if (!user) throw new AppError(404, "User not found");
  return user;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
  });
  if (existing) throw new AppError(409, "Email or username already in use");

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash,
      displayName: input.displayName ?? input.username,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
      role: input.role ?? "USER",
    },
    select: userSelect,
  });
}

export async function updateUserProfile(id: string, input: UpdateUserProfileInput) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, "User not found");

  if (input.username && input.username !== user.username) {
    const taken = await prisma.user.findUnique({ where: { username: input.username } });
    if (taken) throw new AppError(409, "Username already in use");
  }

  return prisma.user.update({
    where: { id },
    data: input,
    select: userSelect,
  });
}

export async function deleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, "User not found");
  await prisma.user.delete({ where: { id } });
  return { id };
}

export async function getUserProfile(userId: string) {
  return getUser(userId);
}
