import "server-only";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { isUniqueViolation, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { MODULE_KEYS, normalizeModules } from "@/lib/modules";
import { EmailTakenError } from "@/lib/team/core";
import { tenantSchemaName } from "@/lib/tenancy/db";
import { MIGRATION_LOCK_KEY, provisionTenantSchema } from "../../../db/migrator.mjs";

// Alta de un taller con su propietario. No verifica permisos: la llaman el panel
// administrativo (tras requirePlatformAdmin) y el registro público (tras validar y limitar).

export type NewTenantInput = {
  name: string;
  owner: { name: string; email: string; password: string };
  // "trial": prueba gratuita con todos los módulos y los días de platform_settings.
  // "active": como lo da de alta el administrador (sin prueba).
  plan: "trial" | "active";
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

async function insertTenant(client: PoolClient, name: string, plan: NewTenantInput["plan"]) {
  const baseSlug = slugify(name);
  const trial = plan === "trial";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
    // ON CONFLICT evita abortar la transacción si el slug ya existe.
    const { rows } = await client.query<{ id: string }>(
      trial
        ? `INSERT INTO tenants (name, slug, modules, subscription_status, trial_ends_at)
           VALUES ($1, $2, $3::text[], 'trialing',
                   now() + make_interval(days => COALESCE((SELECT trial_days FROM platform_settings WHERE id), 30)))
           ON CONFLICT (slug) DO NOTHING RETURNING id`
        : "INSERT INTO tenants (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id",
      trial ? [name, slug, normalizeModules(MODULE_KEYS)] : [name, slug],
    );
    if (rows[0]) return rows[0].id;
  }

  throw new Error("No se pudo generar un identificador único para el taller.");
}

// Crea taller, usuario, membresía, rol de propietario y schema en una sola transacción.
export async function createTenantWithOwner({ name, owner, plan }: NewTenantInput) {
  const passwordHash = await hashPassword(owner.password);

  try {
    return await withTransaction(async (client) => {
      const tenantId = await insertTenant(client, name, plan);
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

      return { tenantId, userId };
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_key")) throw new EmailTakenError();
    throw error;
  }
}
