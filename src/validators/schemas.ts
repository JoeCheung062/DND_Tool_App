import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().min(1),
});

// ── Auth / User Profile ──────────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric/underscore"),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateUserProfileSchema = z.object({
  displayName: z.string().min(1).max(100).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
  role: z.enum(["USER", "DM", "ADMIN"]).optional(),
});

// ── Room ─────────────────────────────────────────────────────────
export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// ── Campaign ─────────────────────────────────────────────────────
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// ── Character ────────────────────────────────────────────────────
export const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  illustration: z.string().url().optional(),
  userId: z.string().min(1).optional(), // defaults to current user when omitted
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  illustration: z.string().url().nullable().optional(),
  userId: z.string().min(1).optional(),
});

// ── Tag ──────────────────────────────────────────────────────────
export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
});

export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
});

// ── Material Slide (Image / Effect / Sound) ──────────────────────
export const materialTypeSchema = z.enum(["IMAGE", "EFFECT", "SOUND"]);

export const createMaterialSchema = z.object({
  type: materialTypeSchema,
  name: z.string().min(1).max(200),
  assetUrl: z.string().min(1),
  /** Presets In Campaign — multiple campaign IDs */
  campaignIds: z.array(z.string().min(1)).default([]),
  /** Tags — multiple tag IDs */
  tagIds: z.array(z.string().min(1)).default([]),
});

export const updateMaterialSchema = z.object({
  type: materialTypeSchema.optional(),
  name: z.string().min(1).max(200).optional(),
  assetUrl: z.string().min(1).optional(),
  campaignIds: z.array(z.string().min(1)).optional(),
  tagIds: z.array(z.string().min(1)).optional(),
});

// ── Combination ──────────────────────────────────────────────────
export const createCombinationSchema = z.object({
  name: z.string().min(1).max(200),
  /** Main material (single) */
  mainMaterialId: z.string().min(1),
  /** Connect materials — multiple material IDs */
  connectMaterialIds: z.array(z.string().min(1)).default([]),
});

export const updateCombinationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  mainMaterialId: z.string().min(1).optional(),
  connectMaterialIds: z.array(z.string().min(1)).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type CreateCombinationInput = z.infer<typeof createCombinationSchema>;
export type UpdateCombinationInput = z.infer<typeof updateCombinationSchema>;
