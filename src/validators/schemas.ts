import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric/underscore"),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  coverUrl: z.string().url().nullable().optional(),
});

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  className: z.string().min(1).max(50),
  level: z.number().int().min(1).max(20).default(1),
  race: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  campaignId: z.string().cuid().optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const diceRollSchema = z.object({
  expression: z
    .string()
    .regex(/^(\d+)?d(4|6|8|10|12|20|100)([+-]\d+)?$/i, "Use NdX+Y format, e.g. 2d6+3"),
  reason: z.string().max(200).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type DiceRollInput = z.infer<typeof diceRollSchema>;
