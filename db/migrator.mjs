// Motor de migraciones compartido por scripts/migrate.mjs y por la app (alta de talleres).
//
// Hay dos niveles:
// - db/migrations: esquema compartido (public). Historial en public.migration_history.
// - db/tenant-migrations: se aplican al schema de cada taller. Historial en <schema>.migration_history.
//
// Reglas:
// - Los archivos se llaman 0001_descripcion.sql y una migración aplicada no se edita
//   (el checksum lo detecta y se detiene todo).
// - Las migraciones de taller siempre corren en transacción y sin prefijo de schema:
//   el search_path apunta al schema del taller.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const GLOBAL_MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
export const TENANT_MIGRATIONS_DIR = path.join(process.cwd(), "db", "tenant-migrations");
export const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
export const NO_TRANSACTION_MARKER = "-- migrate:no-transaction";
export const TENANT_SCHEMA_PATTERN = /^t_[0-9a-f]{32}$/;
// Clave arbitraria para los advisory locks: impide que dos procesos migren a la vez.
export const MIGRATION_LOCK_KEY = "4815162342";

export async function loadMigrations(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const invalid = files.filter((file) => !FILE_PATTERN.test(file));
  if (invalid.length > 0) {
    throw new Error(`Nombres de migración inválidos en ${dir}: ${invalid.join(", ")}. Usa el formato 0001_descripcion.sql`);
  }

  const versions = files.map((file) => file.slice(0, 4));
  const duplicated = versions.filter((version, index) => versions.indexOf(version) !== index);
  if (duplicated.length > 0) {
    throw new Error(`Hay migraciones con el mismo número en ${dir}: ${[...new Set(duplicated)].join(", ")}`);
  }

  return Promise.all(
    files.map(async (name) => {
      // Normaliza BOM y saltos de línea para que el checksum no cambie entre Windows y Linux.
      const sql = (await readFile(path.join(dir, name), "utf8")).replace(/^﻿/, "").replace(/\r\n/g, "\n");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
        useTransaction: !sql.split("\n").some((line) => line.trim() === NO_TRANSACTION_MARKER),
      };
    }),
  );
}

function assertSchema(schema) {
  if (schema !== null && !TENANT_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Schema de taller no válido: ${schema}`);
  }
}

export function historyTable(client, schema) {
  return schema ? `${client.escapeIdentifier(schema)}.migration_history` : "public.migration_history";
}

export async function ensureHistoryTable(client, schema) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${historyTable(client, schema)} (
      id            serial PRIMARY KEY,
      name          text NOT NULL UNIQUE,
      checksum      text NOT NULL,
      execution_ms  integer NOT NULL,
      applied_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function getApplied(client, schema) {
  const { rows } = await client.query(`SELECT name, checksum, applied_at FROM ${historyTable(client, schema)} ORDER BY name`);
  return new Map(rows.map((row) => [row.name, row]));
}

function verifyIntegrity(migrations, applied, label) {
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  const problems = [];

  for (const [name, row] of applied) {
    const migration = byName.get(name);
    if (!migration) {
      problems.push(`  - ${name}: está aplicada pero el archivo ya no existe.`);
    } else if (migration.checksum !== row.checksum) {
      problems.push(`  - ${name}: el archivo cambió después de aplicarse. Crea una migración nueva en lugar de editarla.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`El historial de ${label} no coincide con los archivos:\n${problems.join("\n")}`);
  }
}

// Aplica las migraciones pendientes y devuelve cuántas aplicó.
// Con `inTransaction` el llamador ya abrió una transacción (alta de taller)
// y aquí no se abre ni se cierra ninguna.
export async function applyPending(client, { migrations, schema = null, inTransaction = false, onApplied }) {
  assertSchema(schema);
  await ensureHistoryTable(client, schema);
  const applied = await getApplied(client, schema);
  verifyIntegrity(migrations, applied, schema ?? "public");

  const pending = migrations.filter((migration) => !applied.has(migration.name));

  for (const migration of pending) {
    if (schema && !migration.useTransaction) {
      throw new Error(`${migration.name}: las migraciones de taller siempre corren en transacción.`);
    }

    const startedAt = performance.now();
    const ownsTransaction = !inTransaction && migration.useTransaction;

    try {
      if (ownsTransaction) await client.query("BEGIN");
      if (schema) await client.query(`SET LOCAL search_path TO ${client.escapeIdentifier(schema)}`);
      await client.query(migration.sql);
      if (schema) await client.query("SET LOCAL search_path TO DEFAULT");
      await client.query(`INSERT INTO ${historyTable(client, schema)} (name, checksum, execution_ms) VALUES ($1, $2, $3)`, [
        migration.name,
        migration.checksum,
        Math.round(performance.now() - startedAt),
      ]);
      if (ownsTransaction) await client.query("COMMIT");
    } catch (error) {
      if (ownsTransaction) await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Falló ${migration.name}${schema ? ` en ${schema}` : ""}: ${error.message}`, { cause: error });
    }

    onApplied?.(migration, Math.round(performance.now() - startedAt));
  }

  return pending.length;
}

// Crea (si falta) el schema del taller y le aplica sus migraciones pendientes.
export async function provisionTenantSchema(client, schema, { inTransaction = false, migrations, onApplied } = {}) {
  assertSchema(schema);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${client.escapeIdentifier(schema)}`);
  return applyPending(client, {
    migrations: migrations ?? (await loadMigrations(TENANT_MIGRATIONS_DIR)),
    schema,
    inTransaction,
    onApplied,
  });
}
