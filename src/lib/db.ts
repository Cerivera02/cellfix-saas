import "server-only";
import { Pool, type PoolClient } from "pg";

const globalForDb = globalThis as typeof globalThis & { cellfixPool?: Pool };

// En desarrollo se reutiliza el pool entre recargas para no agotar conexiones.
export const db =
  globalForDb.cellfixPool ??
  new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.cellfixPool = db;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown, constraint: string) {
  if (typeof error !== "object" || error === null) return false;
  const pgError = error as { code?: string; constraint?: string };
  return pgError.code === "23505" && pgError.constraint === constraint;
}
