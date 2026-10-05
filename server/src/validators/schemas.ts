import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const adminRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "DM"]);

const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric/underscore");

// ── Admin auth (login only — Users cannot sign in) ───────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createAdminSchema = z.object({
  email: z.string().email(),
  username: usernameSchema,
  password: z.string().min(8).max(128),
  role: adminRoleSchema.default("ADMIN"),
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
});

export const updateAdminSchema = z.object({
  email: z.string().email().optional(),
  username: usernameSchema.optional(),
  password: z.string().min(8).max(128).optional(),
  role: adminRoleSchema.optional(),
  displayName: z.string().min(1).max(100).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
});

// ── User profiles (no password / no login) ───────────────────────
export const createUserSchema = z.object({
  email: z.string().email(),
  username: usernameSchema,
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
});

export const updateUserProfileSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  username: usernameSchema.optional(),
});

// ── Room ─────────────────────────────────────────────────────────
export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  /** Selected script (Campaign id) */
  campaignId: z.string().min(1).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  campaignId: z.string().min(1).nullable().optional(),
  /** Control layout saved by the room, not by a single Control Mode window. */
  session: z.unknown().nullable().optional(),
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
  /** Optional when uploading via multipart field `file` */
  illustration: z.string().min(1).optional(),
  userId: z.string().min(1),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  illustration: z.string().min(1).nullable().optional(),
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
  /** Optional when uploading a file via multipart field `file` */
  assetUrl: z.string().min(1).optional(),
  /** Included in every campaign download */
  general: z.boolean().optional(),
  /** Avatar on the map, Character Art in the matching zone */
  npc: z.boolean().optional(),
  characterArtUrl: z.string().min(1).nullable().optional(),
  campaignIds: z.array(z.string().min(1)).default([]),
  tagIds: z.array(z.string().min(1)).default([]),
});

export const updateMaterialSchema = z.object({
  type: materialTypeSchema.optional(),
  name: z.string().min(1).max(200).optional(),
  assetUrl: z.string().min(1).optional(),
  general: z.boolean().optional(),
  npc: z.boolean().optional(),
  characterArtUrl: z.string().min(1).nullable().optional(),
  campaignIds: z.array(z.string().min(1)).optional(),
  tagIds: z.array(z.string().min(1)).optional(),
});

// ── Combination ──────────────────────────────────────────────────
const combinationCategorySchema = z.enum(["STANDARD", "ENVIRONMENT_PACK"]);

const zoneMaterialFields = {
  zone1MaterialId: z.string().min(1).optional(),
  zone2MaterialId: z.string().min(1).optional(),
  zone3MaterialId: z.string().min(1).optional(),
  zone4MaterialId: z.string().min(1).optional(),
};

function requireZoneImages(
  value: {
    zone1MaterialId?: string;
    zone2MaterialId?: string;
    zone3MaterialId?: string;
    zone4MaterialId?: string;
  },
  ctx: z.RefinementCtx
) {
  for (const key of [
    "zone1MaterialId",
    "zone2MaterialId",
    "zone3MaterialId",
    "zone4MaterialId",
  ] as const) {
    if (!value[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Choose an image for each zone",
      });
    }
  }
}

export const createCombinationSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: combinationCategorySchema.default("STANDARD"),
    mainMaterialId: z.string().min(1).optional(),
    connectMaterialIds: z.array(z.string().min(1)).default([]),
    ...zoneMaterialFields,
  })
  .superRefine((value, ctx) => {
    if (value.category === "ENVIRONMENT_PACK") {
      requireZoneImages(value, ctx);
      return;
    }
    if (!value.mainMaterialId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mainMaterialId"],
        message: "Main material is required",
      });
    }
  });

export const updateCombinationSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    category: combinationCategorySchema.optional(),
    mainMaterialId: z.string().min(1).nullable().optional(),
    connectMaterialIds: z.array(z.string().min(1)).optional(),
    zone1MaterialId: z.string().min(1).nullable().optional(),
    zone2MaterialId: z.string().min(1).nullable().optional(),
    zone3MaterialId: z.string().min(1).nullable().optional(),
    zone4MaterialId: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.category !== "ENVIRONMENT_PACK") return;
    requireZoneImages(
      {
        zone1MaterialId: value.zone1MaterialId ?? undefined,
        zone2MaterialId: value.zone2MaterialId ?? undefined,
        zone3MaterialId: value.zone3MaterialId ?? undefined,
        zone4MaterialId: value.zone4MaterialId ?? undefined,
      },
      ctx
    );
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
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
