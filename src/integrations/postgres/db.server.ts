// SERVER-ONLY. PostgreSQL connection pool — the replacement for Appwrite's
// databases client. One shared pool per process; every query goes through here.
import { Pool } from "pg";

let pool: Pool | null = null;

export function db(): Pool {
  if (pool) return pool;
  const connectionString =
    (typeof process !== "undefined" ? process.env.PG_URL : "") ||
    "postgresql://localhost:5432/coolpool_migration";
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    // RDS requires TLS; local dev does not. Toggled by PG_SSL=1.
    ssl: process.env.PG_SSL === "1" ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

/** Convenience: run a query and return rows. */
export async function query<T = any>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await db().query(text, params);
  return res.rows as T[];
}

/** First row or null. */
export async function queryOne<T = any>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
