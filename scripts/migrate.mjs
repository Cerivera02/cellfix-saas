// Runner de migraciones con historial.
//
//   npm run db:migrate                  aplica pendientes: primero el esquema compartido, luego cada taller
//   npm run db:status                   muestra migraciones aplicadas y pendientes por nivel
//   npm run db:new -- <nombre>          nueva migración del esquema compartido (db/migrations)
//   npm run db:new:tenant -- <nombre>   nueva migración por taller (db/tenant-migrations)
//
// Las reglas de las migraciones están en db/migrator.mjs.

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./lib/db.mjs";
import {
  FILE_PATTERN,
  GLOBAL_MIGRATIONS_DIR,
  MIGRATION_LOCK_KEY,
  NO_TRANSACTION_MARKER,
  TENANT_MIGRATIONS_DIR,
  applyPending,
  getApplied,
  loadMigrations,
  provisionTenantSchema,
} from "../db/migrator.mjs";

function logApplied(migration, ms) {
  console.log(`    ✓ ${migration.name} (${ms} ms)`);
}

async function listTenants(client) {
  const { rows } = await client.query("SELECT name, schema_name FROM tenants ORDER BY created_at");
  return rows;
}

async function up() {
  const client = await connect();

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_KEY]);

    console.log("Esquema compartido");
    const globalCount = await applyPending(client, {
      migrations: await loadMigrations(GLOBAL_MIGRATIONS_DIR),
      onApplied: logApplied,
    });
    if (globalCount === 0) console.log("    sin pendientes");

    const tenantMigrations = await loadMigrations(TENANT_MIGRATIONS_DIR);
    const tenants = await listTenants(client);
    console.log(`Talleres (${tenants.length})`);

    for (const tenant of tenants) {
      console.log(`  ${tenant.name} — ${tenant.schema_name}`);
      const count = await provisionTenantSchema(client, tenant.schema_name, {
        migrations: tenantMigrations,
        onApplied: logApplied,
      });
      if (count === 0) console.log("    sin pendientes");
    }

    console.log("✓ Migraciones al día.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

function printStatus(migrations, applied) {
  const fileNames = new Set(migrations.map((migration) => migration.name));

  for (const migration of migrations) {
    const row = applied.get(migration.name);
    if (!row) {
      console.log(`    pendiente   ${migration.name}`);
    } else {
      const modified = row.checksum !== migration.checksum ? "  ⚠ modificada después de aplicarse" : "";
      console.log(`    aplicada    ${migration.name}  (${row.applied_at.toISOString()})${modified}`);
    }
  }

  for (const name of applied.keys()) {
    if (!fileNames.has(name)) console.log(`    ⚠ sin archivo ${name}`);
  }

  if (migrations.length === 0) console.log("    no hay archivos de migración");
}

async function tableExists(client, qualifiedName) {
  const { rows } = await client.query("SELECT to_regclass($1) IS NOT NULL AS exists", [qualifiedName]);
  return rows[0].exists;
}

async function status() {
  const client = await connect();

  try {
    console.log("Esquema compartido");
    const globalApplied = (await tableExists(client, "public.migration_history")) ? await getApplied(client, null) : new Map();
    printStatus(await loadMigrations(GLOBAL_MIGRATIONS_DIR), globalApplied);

    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'schema_name'`,
    );
    if (rows.length === 0) {
      console.log("Talleres: aplica primero las migraciones del esquema compartido.");
      return;
    }

    const tenantMigrations = await loadMigrations(TENANT_MIGRATIONS_DIR);
    for (const tenant of await listTenants(client)) {
      console.log(`${tenant.name} — ${tenant.schema_name}`);
      const applied = (await tableExists(client, `${tenant.schema_name}.migration_history`))
        ? await getApplied(client, tenant.schema_name)
        : new Map();
      printStatus(tenantMigrations, applied);
    }
  } finally {
    await client.end();
  }
}

async function create(dir, rawName, hint) {
  const slug = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug) {
    throw new Error(`Indica un nombre, por ejemplo: ${hint}`);
  }

  await mkdir(dir, { recursive: true });
  const existing = (await readdir(dir)).filter((file) => FILE_PATTERN.test(file));
  const lastVersion = existing.reduce((max, file) => Math.max(max, Number(file.slice(0, 4))), 0);
  const name = `${String(lastVersion + 1).padStart(4, "0")}_${slug}.sql`;

  const header =
    dir === TENANT_MIGRATIONS_DIR
      ? `-- ${name}\n-- Corre dentro del schema de cada taller: no uses prefijos de schema ni tenant_id.\n\n`
      : `-- ${name}\n-- Se ejecuta dentro de una transacción. Para desactivarla agrega una línea con: ${NO_TRANSACTION_MARKER}\n\n`;

  await writeFile(path.join(dir, name), header, { flag: "wx" });
  console.log(`✓ Creada ${path.relative(process.cwd(), path.join(dir, name))}`);
}

const [command, ...args] = process.argv.slice(2);
const commands = {
  up,
  status,
  new: () => create(GLOBAL_MIGRATIONS_DIR, args.join("_"), "npm run db:new -- crear_planes"),
  "new-tenant": () => create(TENANT_MIGRATIONS_DIR, args.join("_"), "npm run db:new:tenant -- crear_ordenes"),
};

if (!commands[command]) {
  console.error("Uso: node scripts/migrate.mjs <up|status|new|new-tenant> [nombre]");
  process.exit(1);
}

try {
  await commands[command]();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
