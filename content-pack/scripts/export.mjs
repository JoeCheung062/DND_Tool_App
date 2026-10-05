import { readFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { serializeCatalog, uploadName } from "../catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.resolve(root, "../server");

function loadEnv(file) {
  const env = {};
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const env = loadEnv(path.join(serverRoot, ".env"));
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error("server/.env is missing DATABASE_URL");
  process.exit(1);
}

const uploadDir = path.resolve(serverRoot, env.UPLOAD_DIR || "uploads");
const snapshotDir = path.join(root, "snapshot");
const filesDir = path.join(snapshotDir, "files");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const campaigns = await client.query(
  `SELECT id, name, "createdAt", "updatedAt" FROM "Campaign" ORDER BY name`
);
const tags = await client.query(`SELECT id, name, "createdAt", "updatedAt" FROM "Tag" ORDER BY name`);
const materials = await client.query(
  `SELECT id, type::text AS type, name, general, "assetUrl", "createdAt", "updatedAt" FROM "Material" ORDER BY name`
);
const presets = await client.query(
  `SELECT "materialId", "campaignId", "createdAt" FROM "MaterialCampaignPreset"`
);
const materialTags = await client.query(`SELECT "materialId", "tagId" FROM "MaterialTag"`);
const combinations = await client.query(
  `SELECT id, name, category::text AS category, "mainMaterialId",
          "zone1MaterialId", "zone2MaterialId", "zone3MaterialId", "zone4MaterialId",
          "createdAt", "updatedAt"
   FROM "Combination" ORDER BY name`
);
const connects = await client.query(`SELECT "combinationId", "materialId" FROM "CombinationConnect"`);
const rooms = await client.query(
  `SELECT id, name, "campaignId", "createdAt", "updatedAt" FROM "Room" ORDER BY name`
);
await client.end();

const catalog = serializeCatalog({
  campaigns: campaigns.rows,
  tags: tags.rows,
  materials: materials.rows,
  presets: presets.rows,
  materialTags: materialTags.rows,
  combinations: combinations.rows,
  connects: connects.rows,
  rooms: rooms.rows,
});

await mkdir(filesDir, { recursive: true });
const missing = [];
const copied = [];
for (const material of catalog.materials) {
  const name = uploadName(material.assetUrl);
  if (!name) continue;
  try {
    await copyFile(path.join(uploadDir, name), path.join(filesDir, name));
    copied.push(name);
  } catch (error) {
    if (error?.code === "ENOENT") {
      missing.push(name);
      continue;
    }
    throw error;
  }
}
catalog.missingFiles = missing;

await writeFile(path.join(snapshotDir, "manifest.json"), JSON.stringify(catalog, null, 2));
console.log(
  `Exported ${catalog.rooms.length} rooms, ${catalog.campaigns.length} campaigns, ${catalog.tags.length} tags, ${catalog.materials.length} materials, ${catalog.combinations.length} combinations.`
);
console.log(`Copied ${copied.length} files into content-pack/snapshot/files.`);
if (missing.length > 0) {
  console.log(`Missing upload files: ${missing.join(", ")}`);
}
