import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

// Works for node-postgres (dev/prod) and PGlite (tests).
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export async function connect(url = process.env.DATABASE_URL): Promise<DB> {
  if (!url) throw new Error("DATABASE_URL is not set (see api/.env)");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = (await import("pg")).default;
  return drizzle(new Pool({ connectionString: url }), { schema }) as unknown as DB;
}

export const MIGRATIONS = new URL("../../drizzle", import.meta.url).pathname;

export async function migrate(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set (see api/.env)");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { Pool } = (await import("pg")).default;
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
  await pool.end();
}

export async function testDb(): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}
