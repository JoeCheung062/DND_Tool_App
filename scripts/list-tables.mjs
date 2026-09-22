#!/usr/bin/env node
/**
 * List PostgreSQL tables and row counts.
 * Usage: npm run db:tables
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

await client.connect();

const tables = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
`);

console.log("\nPostgreSQL tables in public schema:\n");
console.log("Table".padEnd(32), "Rows");
console.log("-".repeat(42));

for (const row of tables.rows) {
  const name = row.table_name;
  const count = await client.query(`SELECT COUNT(*)::int AS n FROM "${name}"`);
  console.log(String(name).padEnd(32), count.rows[0].n);
}

console.log("\nTip: open a GUI with  npm run db:studio");
console.log("Tip: raw SQL shell with  npm run db:psql\n");

await client.end();
