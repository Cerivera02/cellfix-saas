import "server-only";
import { db } from "@/lib/db";
import { computeAccess, isSubscriptionStatus, type TenantAccess } from "@/lib/billing/access";

// Acceso de un taller para rutas sin sesión (p. ej. la subida de evidencia desde el celular).
// null si el taller no existe.
export async function getTenantAccess(tenantId: string): Promise<TenantAccess | null> {
  const { rows } = await db.query<{
    subscription_status: string;
    trial_ends_at: Date | null;
    current_period_end: Date | null;
    past_due_since: Date | null;
    grace_days: number | null;
  }>(
    `SELECT t.subscription_status, t.trial_ends_at, t.current_period_end, t.past_due_since, ps.grace_days
       FROM tenants t
       LEFT JOIN platform_settings ps ON ps.id
      WHERE t.id::text = $1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) return null;
  return computeAccess(
    {
      status: isSubscriptionStatus(row.subscription_status) ? row.subscription_status : "active",
      trialEndsAt: row.trial_ends_at,
      currentPeriodEnd: row.current_period_end,
      pastDueSince: row.past_due_since,
    },
    row.grace_days ?? 7,
  );
}
