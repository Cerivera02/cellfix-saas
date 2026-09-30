import "server-only";
import { after } from "next/server";
import type { PoolClient } from "pg";
import { fromCents, toCents } from "@/lib/cash/money";
import type { CashActor } from "@/lib/cash/core";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import {
  renderOrderReadyEmail,
  renderOrderReceivedEmail,
  type OrderEmailData,
  type RenderedEmail,
} from "@/lib/email/templates/order-emails";
import { hasModule, type ModuleKey } from "@/lib/modules";
import { describeDevice, type OrderOutcome } from "@/lib/orders/labels";
import { publicBaseUrl } from "@/lib/public-url";
import { withTenantDb } from "@/lib/tenancy/db";
import { EMAIL_PATTERN, UUID_PATTERN } from "@/lib/validation";

// Correos al cliente de una orden:
// - "received": enlace de seguimiento al recibir el equipo (requiere el módulo de seguimiento).
// - "ready": aviso de que la orden quedó lista para entregar (con enlace si hay seguimiento).
// Se envían después de guardar la orden, sin frenar ni romper el flujo del taller: cualquier falla
// se registra en la consola. Cada uno se envía una sola vez por orden (columnas *_email_sent_at);
// el reenvío manual del enlace tiene una espera mínima por orden y todos cuentan para un tope
// diario por taller (email_log), para que no se puedan usar para mandar correos sin límite.

export type OrderEmailKind = "received" | "ready";

export type OrderEmailContext = {
  tenantId: string;
  tenantSlug: string;
  modules: readonly ModuleKey[];
  actor: CashActor;
};

const SENT_COLUMN: Record<OrderEmailKind, "intake_email_sent_at" | "ready_email_sent_at"> = {
  received: "intake_email_sent_at",
  ready: "ready_email_sent_at",
};

const SENT_NOTE = {
  received: "Se envió al cliente el enlace de seguimiento por correo.",
  ready: "Se avisó al cliente por correo que su equipo está listo.",
  resent: "Se reenvió al cliente el enlace de seguimiento por correo.",
};

type EmailOrderRow = {
  folio: number;
  status: string;
  outcome: OrderOutcome | null;
  device_type: string;
  brand: string;
  model: string;
  reported_issue: string;
  promised_on: string | null;
  created_at: Date;
  estimated_cost: string | null;
  paid_total: string;
  tracking_token: string;
  sent_at: Date | null;
  first_name: string;
  email: string;
  work_total: string;
  work_lines: number;
  diagnosis_line_total: string;
  diagnosis_credit: boolean | null;
  notify_customers: boolean | null;
  business_name: string | null;
  business_phone: string | null;
  business_address: string | null;
  tenant_name: string;
};

// Saldo que ve el cliente, con la misma regla que la página de seguimiento: sin reparación
// registrada se calcula sobre el presupuesto (y el diagnóstico se descuenta o se suma según la
// configuración).
function customerMoney(row: EmailOrderRow): OrderEmailData["money"] {
  const workCents = toCents(row.work_total);
  const diagnosisCents = toCents(row.diagnosis_line_total);
  const paidCents = toCents(row.paid_total);
  const hasWork = row.work_lines > 0;
  const credits = (row.diagnosis_credit ?? true) && row.outcome !== "not_repaired";
  const estimated = !hasWork && row.estimated_cost !== null && row.outcome !== "not_repaired";
  let baseCents = workCents + diagnosisCents;
  if (estimated) {
    const estimateCents = toCents(row.estimated_cost ?? "0");
    baseCents = credits ? Math.max(estimateCents, diagnosisCents) : estimateCents + diagnosisCents;
  }
  return { paid: fromCents(paidCents), balance: fromCents(Math.max(baseCents - paidCents, 0)), estimated };
}

function toEmailData(row: EmailOrderRow, trackingUrl: string | null, baseUrl: string | null): OrderEmailData {
  return {
    assetBaseUrl: baseUrl,
    business: {
      name: row.business_name || row.tenant_name,
      phone: row.business_phone ?? "",
      address: row.business_address ?? "",
    },
    customerFirstName: row.first_name.trim().split(/\s+/)[0] ?? "",
    folio: row.folio,
    device: describeDevice({ deviceType: row.device_type, brand: row.brand, model: row.model }),
    reportedIssue: row.reported_issue,
    createdAt: row.created_at,
    promisedOn: row.promised_on,
    trackingUrl,
    outcome: row.outcome,
    money: customerMoney(row),
  };
}

type Claim =
  | { row: EmailOrderRow; logId: string; previousResentAt: Date | null }
  | { skipped: string; capped?: boolean };

// Tope diario de correos al cliente por taller (automáticos y reenvíos). Durante la prueba, la
// gracia o un pago pendiente el tope es menor: el alta es libre y sin verificar el correo.
const DAILY_LIMIT_PAID = 100;
const DAILY_LIMIT_TRIAL = 20;
// Tiempo mínimo entre reenvíos manuales del enlace de una misma orden.
const RESEND_COOLDOWN = "10 minutes";

// Tope del día según la suscripción del taller: el completo solo con suscripción pagada (activa o
// cancelada con periodo vigente); en prueba, gracia o pago pendiente, el reducido. null si el
// taller está suspendido. El bloqueo por falta de pago ya lo aplica la sesión en las acciones.
async function dailyLimit(client: PoolClient, tenantId: string): Promise<number | null> {
  const { rows } = await client.query<{ active: boolean; paid: boolean }>(
    `SELECT status = 'active' AS active,
            COALESCE(subscription_status = 'active'
                     OR (subscription_status = 'canceled' AND current_period_end > now()), false) AS paid
       FROM public.tenants
      WHERE id = $1`,
    [tenantId],
  );
  const tenant = rows[0];
  if (!tenant?.active) return null;
  return tenant.paid ? DAILY_LIMIT_PAID : DAILY_LIMIT_TRIAL;
}

// Lee la orden bloqueándola y, si corresponde enviar, deja el correo reservado en la misma
// transacción: marca de enviado (o del último reenvío) y renglón en email_log, que cuenta para el
// tope diario. Si el envío falla, `releaseClaim` deshace la reserva.
async function claimOrder(
  context: OrderEmailContext,
  orderId: string,
  kind: OrderEmailKind,
  manual: boolean,
): Promise<Claim> {
  const column = SENT_COLUMN[kind];
  return withTenantDb(context.tenantId, async (client) => {
    const { rows } = await client.query<EmailOrderRow & { last_resent_at: Date | null; resend_blocked: boolean }>(
      `SELECT o.folio::int AS folio, o.status, o.outcome, o.device_type, o.brand, o.model, o.reported_issue,
              o.promised_on::text AS promised_on, o.created_at, o.estimated_cost, o.paid_total, o.tracking_token,
              o.${column} AS sent_at, o.last_resent_at,
              COALESCE(o.last_resent_at > now() - interval '${RESEND_COOLDOWN}', false) AS resend_blocked,
              c.first_name, c.email,
              COALESCE((SELECT sum(l.total) FROM repair_order_lines l
                         WHERE l.order_id = o.id AND NOT l.is_diagnosis), 0)::text AS work_total,
              COALESCE((SELECT sum(l.total) FROM repair_order_lines l
                         WHERE l.order_id = o.id AND l.is_diagnosis), 0)::text AS diagnosis_line_total,
              (SELECT count(*) FROM repair_order_lines l WHERE l.order_id = o.id AND NOT l.is_diagnosis)::int
                AS work_lines,
              rs.diagnosis_credit, rs.notify_customers,
              s.business_name, s.phone AS business_phone, s.address AS business_address,
              t.name AS tenant_name
         FROM repair_orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN public.tenants t ON t.id = $2
         LEFT JOIN ticket_settings s ON true
         LEFT JOIN repair_settings rs ON true
        WHERE o.id = $1
          FOR UPDATE OF o`,
      [orderId, context.tenantId],
    );
    const row = rows[0];
    if (!row) return { skipped: "La orden no existe." };
    if (!EMAIL_PATTERN.test(row.email.trim())) return { skipped: "El cliente no tiene correo registrado." };
    if (kind === "received" && row.status === "cancelled") return { skipped: "La orden está cancelada." };
    if (kind === "ready" && row.status !== "ready") return { skipped: "La orden ya no está lista." };
    if (row.notify_customers === false) {
      return { skipped: "Los correos al cliente están apagados en Configuración → Órdenes." };
    }
    if (manual && row.resend_blocked) {
      return { skipped: "Ya se envió el enlace hace poco. Espera unos minutos para reenviarlo." };
    }
    if (!manual && row.sent_at) return { skipped: "El correo ya se había enviado." };

    // El tope se revisa con un candado por taller para que envíos simultáneos no lo rebasen.
    await client.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':customer-email'))");
    const limit = await dailyLimit(client, context.tenantId);
    if (limit === null) return { skipped: "El taller no puede enviar correos por ahora." };
    const { rows: countRows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM email_log
        WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City')`,
    );
    if ((countRows[0]?.count ?? 0) >= limit) {
      return { skipped: "Se alcanzó el límite de correos de hoy. Inténtalo mañana.", capped: true };
    }

    if (manual) await client.query("UPDATE repair_orders SET last_resent_at = now() WHERE id = $1", [orderId]);
    else await client.query(`UPDATE repair_orders SET ${column} = now() WHERE id = $1`, [orderId]);
    const { rows: logRows } = await client.query<{ id: string }>(
      "INSERT INTO email_log (order_id, kind, recipient) VALUES ($1, $2, $3) RETURNING id",
      [orderId, manual ? "resent" : kind, row.email.trim().slice(0, 200)],
    );
    return { row, logId: logRows[0].id, previousResentAt: row.last_resent_at };
  });
}

async function recordSent(context: OrderEmailContext, orderId: string, kind: OrderEmailKind, manual: boolean) {
  await withTenantDb(context.tenantId, async (client) => {
    // El reenvío también cuenta como enviado para el correo automático.
    if (manual) await client.query(`UPDATE repair_orders SET ${SENT_COLUMN[kind]} = now() WHERE id = $1`, [orderId]);
    await client.query(
      "INSERT INTO repair_order_events (order_id, status, note, user_id, user_name) VALUES ($1, NULL, $2, $3, $4)",
      [orderId, manual ? SENT_NOTE.resent : SENT_NOTE[kind], context.actor.userId, context.actor.userName],
    );
  });
}

// Si falló el envío se deshace la reserva: no cuenta para el tope y un cambio posterior (o un
// reenvío) puede intentarlo de nuevo.
async function releaseClaim(
  context: OrderEmailContext,
  orderId: string,
  kind: OrderEmailKind,
  manual: boolean,
  claim: { logId: string; previousResentAt: Date | null },
) {
  await withTenantDb(context.tenantId, async (client) => {
    await client.query("DELETE FROM email_log WHERE id = $1", [claim.logId]);
    if (manual) {
      await client.query("UPDATE repair_orders SET last_resent_at = $1 WHERE id = $2", [claim.previousResentAt, orderId]);
    } else {
      await client.query(`UPDATE repair_orders SET ${SENT_COLUMN[kind]} = NULL WHERE id = $1`, [orderId]);
    }
  });
}

function trackingUrlFor(context: OrderEmailContext, baseUrl: string | null, token: string) {
  if (!baseUrl || !hasModule(context.modules, "tracking")) return null;
  return `${baseUrl}/s/${encodeURIComponent(context.tenantSlug)}/${token}`;
}

export type OrderEmailResult = { sent: true; to: string } | { sent: false; reason: string };

async function deliver(
  context: OrderEmailContext,
  orderId: string,
  kind: OrderEmailKind,
  options: { baseUrl: string | null; manual: boolean },
): Promise<OrderEmailResult> {
  if (!UUID_PATTERN.test(orderId)) return { sent: false, reason: "Solicitud no válida." };
  if (kind === "received" && !hasModule(context.modules, "tracking")) {
    return { sent: false, reason: "El seguimiento para clientes no está activo." };
  }
  if (!isEmailConfigured()) return { sent: false, reason: "El envío de correos no está configurado." };

  const claim = await claimOrder(context, orderId, kind, options.manual);
  if ("skipped" in claim) {
    if (claim.capped && !options.manual) {
      console.warn(`Correo al cliente omitido: el taller ${context.tenantId} alcanzó el límite diario.`);
    }
    return { sent: false, reason: claim.skipped };
  }

  const { row } = claim;
  const trackingUrl = trackingUrlFor(context, options.baseUrl, row.tracking_token);
  let rendered: RenderedEmail | null = null;
  try {
    const data = toEmailData(row, trackingUrl, options.baseUrl);
    if (kind === "ready") rendered = renderOrderReadyEmail(data);
    else if (trackingUrl) rendered = renderOrderReceivedEmail({ ...data, trackingUrl });
  } catch (error) {
    console.error("No se pudo preparar el correo al cliente:", error);
  }

  const to = row.email.trim();
  const sent = rendered
    ? await sendEmail({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        fromName: row.business_name || row.tenant_name,
      })
    : false;

  if (sent) {
    await recordSent(context, orderId, kind, options.manual);
    return { sent: true, to };
  }
  await releaseClaim(context, orderId, kind, options.manual, claim);
  return { sent: false, reason: "No pudimos enviar el correo. Inténtalo más tarde." };
}

// URL pública para el enlace; null si no se puede calcular (el correo "ready" sale sin enlace).
async function resolveBaseUrl(context: OrderEmailContext) {
  if (!hasModule(context.modules, "tracking")) return null;
  try {
    return await publicBaseUrl();
  } catch (error) {
    console.error("No se pudo calcular la URL pública para el correo al cliente:", error);
    return null;
  }
}

// Programa el correo automático para después de responder (Next `after`). Se llama desde la
// acción una vez que la transacción de la orden ya se guardó; nunca lanza.
export async function queueOrderEmail(context: OrderEmailContext, orderId: string, kind: OrderEmailKind) {
  try {
    // La URL se calcula aquí, mientras la petición sigue disponible.
    const baseUrl = await resolveBaseUrl(context);
    after(async () => {
      try {
        await deliver(context, orderId, kind, { baseUrl, manual: false });
      } catch (error) {
        console.error("Error al enviar el correo al cliente:", error);
      }
    });
  } catch (error) {
    console.error("No se pudo programar el correo al cliente:", error);
  }
}

// Reenvío manual del enlace de seguimiento desde la orden. Espera el resultado para mostrarlo.
export async function resendTrackingEmail(context: OrderEmailContext, orderId: string): Promise<OrderEmailResult> {
  try {
    return await deliver(context, orderId, "received", { baseUrl: await resolveBaseUrl(context), manual: true });
  } catch (error) {
    console.error("Error al reenviar el enlace de seguimiento:", error);
    return { sent: false, reason: "No pudimos enviar el correo. Inténtalo más tarde." };
  }
}
