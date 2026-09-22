import { prisma } from "../config/prisma.js";

export async function getDataOverview() {
  const [
    rooms,
    campaigns,
    users,
    characters,
    tags,
    materials,
    combinations,
    materialsByType,
  ] = await Promise.all([
    prisma.room.count(),
    prisma.campaign.count(),
    prisma.user.count(),
    prisma.character.count(),
    prisma.tag.count(),
    prisma.material.count(),
    prisma.combination.count(),
    prisma.material.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
  ]);

  return {
    counts: {
      rooms,
      campaigns,
      users,
      characters,
      tags,
      materials,
      combinations,
    },
    materialsByType: Object.fromEntries(
      materialsByType.map((row) => [row.type, row._count._all])
    ),
  };
}

/** List PostgreSQL tables + row counts for the public schema */
export async function listSqlTables() {
  const tables = await prisma.$queryRaw<
    { table_name: string; approx_rows: bigint | number | null }[]
  >`
    SELECT c.relname AS table_name,
           c.reltuples::bigint AS approx_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname;
  `;

  const exact = await Promise.all(
    tables.map(async (t) => {
      const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM "${t.table_name}"`
      );
      return {
        table: t.table_name,
        rows: Number(result[0]?.count ?? 0),
      };
    })
  );

  return exact;
}

export async function describeTable(tableName: string) {
  const allowed = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const names = new Set(allowed.map((t) => t.table_name));
  if (!names.has(tableName)) {
    return null;
  }

  const columns = await prisma.$queryRaw<
    {
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }[]
  >`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position;
  `;

  return { table: tableName, columns };
}
