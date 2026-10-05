import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_ORIGIN: z
    .string()
    .default("http://localhost:5173,http://localhost:5174"),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_FILE_SIZE_MB: z.coerce.number().default(100),
  // Optional S3 — when unset, files are stored locally
  S3_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isS3Enabled =
  Boolean(env.S3_ENABLED) &&
  Boolean(env.S3_BUCKET) &&
  Boolean(env.S3_REGION) &&
  Boolean(env.S3_ACCESS_KEY_ID) &&
  Boolean(env.S3_SECRET_ACCESS_KEY);
