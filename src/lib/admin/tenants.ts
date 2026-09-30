import "server-only";
import { cache } from "react";
import { db, withTransaction } from "@/lib/db";
import { computeAccess, isSubscriptionStatus, type SubscriptionStatus, type TenantAccess } from "@/lib/billing/access";
import { normalizeModules, type ModuleKey } from "@/lib/modules";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getTeam, type Team } from "@/lib/team/core";
import { isStripeSubscriptionLive } from "@/lib/billing/subscription";
import { createTenantWithOwner } from "@/lib/tenancy/create";
import { UUID_PATTERN } from "@/lib/validation";

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
  subscriptionStatus: SubscriptionStatus;
  access: TenantAccess;
};

export type TenantSubscription = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  access: TenantAccess;
};

type SubscriptionColumns = {
  subscription_status: string;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  past_due_since: Date | null;
  grace_days: number | null;
};

function toAccess(row: SubscriptionColumns) {
  const status = isSubscriptionStatus(row.subscription_status) ? row.subscription_status : "active";
  return {
    status,
    access: computeAccess(
      {
        status,
        trialEndsAt: row.trial_ends_at,
        currentPeriodEnd: row.current_period_end,
        pastDueSince: row.past_due_since,
      },
      row.grace_days ?? 7,
    ),
  };
}

export type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  // Módulos opcionales activos; la base (reparaciones, clientes y equipo) siempre está activa.
  modules: ModuleKey[];
  subscription: TenantSubscription;
  team: Team;
};

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
  } & SubscriptionColumns>(
    `SELECT t.id, t.name, t.slug, t.status, t.created_at,
            t.subscription_status, t.trial_ends_at, t.current_period_end, t.past_due_since, ps.grace_days,
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
       LEFT JOIN platform_settings ps ON ps.id
      ORDER BY t.created_at DESC`,
  );

  return rows.map((row) => {
    const { status, access } = toAccess(row);
    return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at,
    userCount: row.user_count,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    subscriptionStatus: status,
    access,
    };
  });
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
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  } & SubscriptionColumns>(
    `SELECT t.id, t.name, t.slug, t.status, t.created_at, t.modules,
            t.subscription_status, t.trial_ends_at, t.current_period_end, t.past_due_since, ps.grace_days,
            t.stripe_customer_id, t.stripe_subscription_id
       FROM tenants t
       LEFT JOIN platform_settings ps ON ps.id
      WHERE t.id = $1`,
    [tenantId],
  );
  const tenant = rows[0];
  if (!tenant) return null;

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    createdAt: tenant.created_at,
    modules: normalizeModules(tenant.modules),
    subscription: {
      ...toAccess(tenant),
      trialEndsAt: tenant.trial_ends_at,
      currentPeriodEnd: tenant.current_period_end,
      stripeCustomerId: tenant.stripe_customer_id,
      stripeSubscriptionId: tenant.stripe_subscription_id,
    },
    team: await getTeam(tenant.id),
  };
});

// Crea el taller y su propietario en una sola transacción. Devuelve el id del taller.
// Los talleres que da de alta el administrador quedan activos, sin prueba.
export async function createTenant(name: string, owner: { name: string; email: string; password: string }) {
  await requirePlatformAdmin();
  const { tenantId } = await createTenantWithOwner({ name, owner, plan: "active" });
  return tenantId;
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

// ¿El taller tiene una suscripción de Stripe que sigue cobrándose? Se pregunta a Stripe;
// si no está configurado, se confía en el estado guardado.
async function hasLiveStripeSubscription(tenantId: string) {
  const { rows } = await db.query<{ subscription_status: string; stripe_subscription_id: string | null }>(
    "SELECT subscription_status, stripe_subscription_id FROM tenants WHERE id = $1",
    [tenantId],
  );
  const row = rows[0];
  if (!row?.stripe_subscription_id) return false;
  const live = await isStripeSubscriptionLive(row.stripe_subscription_id);
  return live ?? (row.subscription_status === "active" || row.subscription_status === "past_due");
}

// Alarga la prueba N días desde su fin (o desde hoy si ya terminó). Sirve también para
// darle más tiempo a un taller bloqueado. No aplica si ya paga con Stripe.
// Una suscripción de Stripe que ya no cobra se desliga (se conserva el cliente) para que sus
// eventos tardíos no cambien el estado.
export async function extendTenantTrial(tenantId: string, days: number) {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return false;
  if (await hasLiveStripeSubscription(tenantId)) return false;
  const { rowCount } = await db.query(
    `UPDATE tenants
        SET subscription_status = 'trialing',
            trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + make_interval(days => $2::int),
            stripe_subscription_id = NULL,
            current_period_end = NULL,
            past_due_since = NULL
      WHERE id = $1`,
    [tenantId, days],
  );
  return (rowCount ?? 0) > 0;
}

// Activa el taller sin Stripe (pago por fuera): acceso sin fecha de fin. Si su suscripción de
// Stripe ya no cobra, se desliga igual que al extender la prueba.
export async function markTenantActive(tenantId: string) {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return;
  const keepSubscription = await hasLiveStripeSubscription(tenantId);
  await db.query(
    `UPDATE tenants
        SET subscription_status = 'active',
            current_period_end = NULL,
            past_due_since = NULL,
            stripe_subscription_id = CASE WHEN $2::boolean THEN stripe_subscription_id END
      WHERE id = $1`,
    [tenantId, keepSubscription],
  );
}
