import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env, isS3Enabled } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

let s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: env.S3_REGION!,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      ...(env.S3_ENDPOINT
        ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
    });
  }
  return s3;
}

export async function ensureUploadDir() {
  const dir = path.resolve(env.UPLOAD_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function buildFilename(originalName: string) {
  const ext = path.extname(originalName).toLowerCase() || ".bin";
  return `${Date.now()}-${randomUUID()}${ext}`;
}

async function storeLocal(file: Express.Multer.File, filename: string) {
  const dir = await ensureUploadDir();
  const dest = path.join(dir, filename);
  await fs.writeFile(dest, file.buffer);
  return {
    url: `/uploads/${filename}`,
    storage: "local" as const,
  };
}

async function storeS3(file: Express.Multer.File, filename: string) {
  const client = getS3Client();
  const key = `uploads/${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    })
  );

  const publicBase =
    env.S3_PUBLIC_URL ??
    (env.S3_ENDPOINT
      ? `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}`
      : `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`);

  return {
    url: `${publicBase.replace(/\/$/, "")}/${key}`,
    storage: "s3" as const,
  };
}

export async function saveUpload(
  file: Express.Multer.File | undefined,
  uploaderId?: string
) {
  if (!file) {
    throw new AppError(400, "No file provided. Use field name \"file\".");
  }

  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError(
      400,
      "Unsupported file type. Allowed: images, audio, and short video assets"
    );
  }

  const filename = buildFilename(file.originalname);
  const stored = isS3Enabled
    ? await storeS3(file, filename)
    : await storeLocal(file, filename);

  return {
    filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: stored.url,
    storage: stored.storage,
    uploaderId: uploaderId ?? null,
  };
}

export function getStorageMode() {
  return isS3Enabled ? "s3" : "local";
}
