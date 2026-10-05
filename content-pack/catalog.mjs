import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const SERVER_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/dnd_app?schema=public";

function stamp(value) {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

export function uploadName(assetUrl) {
  if (typeof assetUrl !== "string" || !assetUrl.startsWith("/uploads/")) return null;
  const pathOnly = assetUrl.split(/[?#]/)[0];
  const name = path.basename(pathOnly);
  if (!name || name === "." || name === "..") return null;
  return name;
}

export function serializeCatalog(rows) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    campaigns: rows.campaigns.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: stamp(row.createdAt),
      updatedAt: stamp(row.updatedAt),
    })),
    tags: rows.tags.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: stamp(row.createdAt),
      updatedAt: stamp(row.updatedAt),
    })),
    materials: rows.materials.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      general: Boolean(row.general),
      assetUrl: row.assetUrl,
      file: uploadName(row.assetUrl),
      createdAt: stamp(row.createdAt),
      updatedAt: stamp(row.updatedAt),
    })),
    presets: rows.presets.map((row) => ({
      materialId: row.materialId,
      campaignId: row.campaignId,
      createdAt: stamp(row.createdAt),
    })),
    materialTags: rows.materialTags.map((row) => ({
      materialId: row.materialId,
      tagId: row.tagId,
    })),
    combinations: rows.combinations.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      mainMaterialId: row.mainMaterialId,
      zone1MaterialId: row.zone1MaterialId,
      zone2MaterialId: row.zone2MaterialId,
      zone3MaterialId: row.zone3MaterialId,
      zone4MaterialId: row.zone4MaterialId,
      createdAt: stamp(row.createdAt),
      updatedAt: stamp(row.updatedAt),
    })),
    connects: rows.connects.map((row) => ({
      combinationId: row.combinationId,
      materialId: row.materialId,
    })),
    rooms: rows.rooms.map((row) => ({
      id: row.id,
      name: row.name,
      campaignId: row.campaignId,
      createdAt: stamp(row.createdAt),
      updatedAt: stamp(row.updatedAt),
    })),
  };
}

async function upsertTag(client, tag) {
  await client.query("SAVEPOINT tag_upsert");
  try {
    await client.query(
      `INSERT INTO "Tag" (id, name, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"`,
      [tag.id, tag.name, tag.createdAt, tag.updatedAt]
    );
    await client.query("RELEASE SAVEPOINT tag_upsert");
    return tag.id;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT tag_upsert");
    if (error?.code !== "23505") throw error;
    const found = await client.query(`SELECT id FROM "Tag" WHERE name = $1`, [tag.name]);
    const existing = found.rows[0]?.id;
    if (!existing) throw error;
    return existing;
  }
}

export async function applyCatalog(client, catalog) {
  const tagIds = new Map();
  await client.query("BEGIN");
  try {
    for (const campaign of catalog.campaigns) {
      await client.query(
        `INSERT INTO "Campaign" (id, name, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"`,
        [campaign.id, campaign.name, campaign.createdAt, campaign.updatedAt]
      );
    }

    for (const tag of catalog.tags) {
      tagIds.set(tag.id, await upsertTag(client, tag));
    }

    for (const material of catalog.materials) {
      await client.query(
        `INSERT INTO "Material" (id, type, name, general, "assetUrl", "createdAt", "updatedAt")
         VALUES ($1, $2::"MaterialType", $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type,
           name = EXCLUDED.name,
           general = EXCLUDED.general,
           "assetUrl" = EXCLUDED."assetUrl",
           "updatedAt" = EXCLUDED."updatedAt"`,
        [
          material.id,
          material.type,
          material.name,
          material.general,
          material.assetUrl,
          material.createdAt,
          material.updatedAt,
        ]
      );
    }

    for (const preset of catalog.presets) {
      await client.query(
        `INSERT INTO "MaterialCampaignPreset" ("materialId", "campaignId", "createdAt")
         VALUES ($1, $2, $3)
         ON CONFLICT ("materialId", "campaignId") DO NOTHING`,
        [preset.materialId, preset.campaignId, preset.createdAt]
      );
    }

    for (const link of catalog.materialTags) {
      const tagId = tagIds.get(link.tagId) ?? link.tagId;
      await client.query(
        `INSERT INTO "MaterialTag" ("materialId", "tagId")
         VALUES ($1, $2)
         ON CONFLICT ("materialId", "tagId") DO NOTHING`,
        [link.materialId, tagId]
      );
    }

    for (const combination of catalog.combinations) {
      await client.query(
        `INSERT INTO "Combination" (
           id, name, category, "mainMaterialId",
           "zone1MaterialId", "zone2MaterialId", "zone3MaterialId", "zone4MaterialId",
           "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3::"CombinationCategory", $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           "mainMaterialId" = EXCLUDED."mainMaterialId",
           "zone1MaterialId" = EXCLUDED."zone1MaterialId",
           "zone2MaterialId" = EXCLUDED."zone2MaterialId",
           "zone3MaterialId" = EXCLUDED."zone3MaterialId",
           "zone4MaterialId" = EXCLUDED."zone4MaterialId",
           "updatedAt" = EXCLUDED."updatedAt"`,
        [
          combination.id,
          combination.name,
          combination.category,
          combination.mainMaterialId,
          combination.zone1MaterialId,
          combination.zone2MaterialId,
          combination.zone3MaterialId,
          combination.zone4MaterialId,
          combination.createdAt,
          combination.updatedAt,
        ]
      );
    }

    for (const link of catalog.connects) {
      await client.query(
        `INSERT INTO "CombinationConnect" ("combinationId", "materialId")
         VALUES ($1, $2)
         ON CONFLICT ("combinationId", "materialId") DO NOTHING`,
        [link.combinationId, link.materialId]
      );
    }

    for (const room of catalog.rooms) {
      await client.query(
        `INSERT INTO "Room" (id, name, "campaignId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           "campaignId" = EXCLUDED."campaignId",
           "updatedAt" = EXCLUDED."updatedAt"`,
        [room.id, room.name, room.campaignId, room.createdAt, room.updatedAt]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return {
    campaigns: catalog.campaigns.length,
    tags: catalog.tags.length,
    materials: catalog.materials.length,
    combinations: catalog.combinations.length,
    rooms: catalog.rooms.length,
  };
}

export async function copyCatalogFiles(catalog, sourceDir, uploadDir) {
  await mkdir(uploadDir, { recursive: true });
  const copied = [];
  const missing = [];
  for (const material of catalog.materials) {
    if (!material.file) continue;
    const source = path.join(sourceDir, material.file);
    try {
      await copyFile(source, path.join(uploadDir, material.file));
      copied.push(material.file);
    } catch (error) {
      if (error?.code === "ENOENT") {
        missing.push(material.file);
        continue;
      }
      throw error;
    }
  }
  return { copied, missing };
}
