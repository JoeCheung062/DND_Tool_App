import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { signToken } from "../utils/jwt.js";
import type {
  CreateAdminInput,
  CreateUserInput,
  LoginInput,
  UpdateAdminInput,
  UpdateUserProfileInput,
} from "../validators/schemas.js";

const adminSelect = {
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

const userSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Admin-only login. User accounts cannot authenticate. */
export async function loginAdmin(input: LoginInput) {
  const admin = await prisma.admin.findUnique({ where: { email: input.email } });
  if (!admin) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, admin.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = signToken({
    id: admin.id,
    email: admin.email,
    username: admin.username,
    role: admin.role,
    accountType: "admin",
  });

  return {
    admin: {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      displayName: admin.displayName,
      avatarUrl: admin.avatarUrl,
      bio: admin.bio,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    },
    token,
  };
}

export async function getAdminProfile(adminId: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: adminSelect,
  });
  if (!admin) throw new AppError(404, "Admin not found");
  return admin;
}

export async function listAdmins() {
  return prisma.admin.findMany({
    select: adminSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getAdmin(id: string) {
  const admin = await prisma.admin.findUnique({
    where: { id },
    select: adminSelect,
  });
  if (!admin) throw new AppError(404, "Admin not found");
  return admin;
}

export async function createAdmin(input: CreateAdminInput) {
  const existing = await prisma.admin.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
  });
  if (existing) throw new AppError(409, "Admin email or username already in use");

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.admin.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash,
      role: input.role ?? "ADMIN",
      displayName: input.displayName ?? input.username,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
    },
    select: adminSelect,
  });
}

export async function updateAdmin(id: string, input: UpdateAdminInput) {
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) throw new AppError(404, "Admin not found");

  if (input.email && input.email !== admin.email) {
    const taken = await prisma.admin.findUnique({ where: { email: input.email } });
    if (taken) throw new AppError(409, "Admin email already in use");
  }
  if (input.username && input.username !== admin.username) {
    const taken = await prisma.admin.findUnique({
      where: { username: input.username },
    });
    if (taken) throw new AppError(409, "Admin username already in use");
  }

  const { password, ...rest } = input;
  return prisma.admin.update({
    where: { id },
    data: {
      ...rest,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
    },
    select: adminSelect,
  });
}

export async function deleteAdmin(id: string, actorId: string) {
  if (id === actorId) {
    throw new AppError(400, "You cannot delete your own admin account");
  }
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) throw new AppError(404, "Admin not found");

  const superCount = await prisma.admin.count({ where: { role: "SUPER_ADMIN" } });
  if (admin.role === "SUPER_ADMIN" && superCount <= 1) {
    throw new AppError(400, "Cannot delete the last Super Admin");
  }

  await prisma.admin.delete({ where: { id } });
  return { id };
}

// ── Users (no login) ─────────────────────────────────────────────

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
  if (existing) throw new AppError(409, "User email or username already in use");

  return prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      displayName: input.displayName ?? input.username,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
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
  if (input.email && input.email !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: input.email } });
    if (taken) throw new AppError(409, "Email already in use");
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
