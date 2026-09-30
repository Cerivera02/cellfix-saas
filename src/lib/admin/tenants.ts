import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import type { PoolClient } from "pg";
import { db, isUniqueViolation, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { normalizeModules, type ModuleKey } from "@/lib/modules";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { EmailTakenError, getTeam, type Team } from "@/lib/team/core";
import { tenantSchemaName } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";
import { MIGRATION_LOCK_KEY, provisionTenantSchema } from "../../../db/migrator.mjs";

// Capa de datos del panel administrativo: cada función verifica que quien la
// llama sea administrador de la plataforma.

export type TenantStatus = "active" | "suspended";

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  userCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
};

export type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  // Módulos opcionales activos; la base (reparaciones, clientes y equipo) siempre está activa.
  modules: ModuleKey[];
  team: Team;
};

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "taller";
}

async function insertTenant(client: PoolClient, name: string) {
  const baseSlug = slugify(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
    // ON CONFLICT evita abortar la transacción si el slug ya existe.
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO tenants (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id",
      [name, slug],
    );
    if (rows[0]) return rows[0].id;
  }

  throw new Error("No se pudo generar un identificador único para el taller.");
}

export async function listTenants(): Promise<TenantSummary[]> {
  await requirePlatformAdmin();

  const { rows } = await db.query<{
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
    created_at: Date;
    user_count: number;
    owner_name: string | null;
    owner_email: string | null;
  }>(
    `SELECT t.id, t.name, t.slug, t.status, t.created_at,
            (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = t.id) AS user_count,
            o.name AS owner_name, o.email AS owner_email
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT u.name, u.email
           FROM member_roles mr
           JOIN users u ON u.id = mr.user_id
          WHERE mr.tenant_id = t.id AND mr.system_role = 'owner'
          ORDER BY mr.created_at
          LIMIT 1
       ) o ON true
      ORDER BY t.created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at,
    userCount: row.user_count,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
  }));
}

export const getTenant = cache(async (tenantId: string): Promise<TenantDetail | null> => {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return null;

  const { rows } = await db.query<{
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
    created_at: Date;
    modules: string[];
  }>("SELECT id, name, slug, status, created_at, modules FROM tenants WHERE id = $1", [tenantId]);
  const tenant = rows[0];
  if (!tenant) return null;

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    createdAt: tenant.created_at,
    modules: normalizeModules(tenant.modules),
    team: await getTeam(tenant.id),
  };
});

// Crea el taller y su propietario en una sola transacción. Devuelve el id del taller.
export async function createTenant(name: string, owner: { name: string; email: string; password: string }) {
  await requirePlatformAdmin();
  const passwordHash = await hashPassword(owner.password);

  try {
    return await withTransaction(async (client) => {
      const tenantId = await insertTenant(client, name);
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [owner.name, owner.email, passwordHash],
      );
      const userId = rows[0].id;
      await client.query("INSERT INTO memberships (tenant_id, user_id) VALUES ($1, $2)", [tenantId, userId]);
      await client.query("INSERT INTO member_roles (tenant_id, user_id, system_role) VALUES ($1, $2, 'owner')", [
        tenantId,
        userId,
      ]);

      // Crea el schema del taller y le aplica sus migraciones en la misma transacción:
      // si algo falla no queda un taller a medias. El lock espera a un db:migrate en curso.
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [MIGRATION_LOCK_KEY]);
      await provisionTenantSchema(client, tenantSchemaName(tenantId), { inTransaction: true });

      return tenantId;
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_key")) throw new EmailTakenError();
    throw error;
  }
}

export async function updateTenantName(tenantId: string, name: string) {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return;
  await db.query("UPDATE tenants SET name = $1 WHERE id = $2", [name, tenantId]);
}

// Activa o apaga módulos opcionales. Apagar un módulo solo lo oculta: sus datos se conservan.
export async function setTenantModules(tenantId: string, modules: readonly string[]) {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return;
  await db.query("UPDATE tenants SET modules = $1::text[] WHERE id = $2", [normalizeModules(modules), tenantId]);
}

export async function setTenantStatus(tenantId: string, status: TenantStatus) {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return;

  await withTransaction(async (client) => {
    await client.query("UPDATE tenants SET status = $1 WHERE id = $2", [status, tenantId]);
    if (status === "suspended") {
      await client.query("DELETE FROM sessions WHERE tenant_id = $1", [tenantId]);
    }
  });
}
