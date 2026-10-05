import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyCatalog, copyCatalogFiles, SERVER_DATABASE_URL } from "../catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "snapshot", "manifest.json");
const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
const uploadDir = path.join(root, ".test-uploads");
await rm(uploadDir, { recursive: true, force: true });

const files = await copyCatalogFiles(catalog, path.join(root, "snapshot", "files"), uploadDir);
const client = new pg.Client({ connectionString: SERVER_DATABASE_URL });
await client.connect();
const counts = await applyCatalog(client, catalog);
const check = await client.query(
  `SELECT
     (SELECT count(*) FROM "Room")::int AS rooms,
     (SELECT count(*) FROM "Campaign")::int AS campaigns,
     (SELECT count(*) FROM "Tag")::int AS tags,
     (SELECT count(*) FROM "Material")::int AS materials,
     (SELECT count(*) FROM "Combination")::int AS combinations`
);
await client.end();
await rm(uploadDir, { recursive: true, force: true });

const row = check.rows[0];
const expected = {
  rooms: catalog.rooms.length,
  campaigns: catalog.campaigns.length,
  tags: catalog.tags.length,
  materials: catalog.materials.length,
  combinations: catalog.combinations.length,
};
for (const key of Object.keys(expected)) {
  if (row[key] < expected[key] || counts[key] !== expected[key]) {
    console.error("import selftest failed", { key, row, counts, expected });
    process.exit(1);
  }
}
if (files.copied.length + files.missing.length !== catalog.materials.filter((item) => item.file).length) {
  console.error("file copy count mismatch", files);
  process.exit(1);
}
console.log("content import selftest: ok", counts, `files ${files.copied.length}`, `missing ${files.missing.length}`);
