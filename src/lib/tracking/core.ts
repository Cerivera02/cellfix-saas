import "server-only";
import { db } from "@/lib/db";
import { fromCents, toCents } from "@/lib/cash/money";
import { hasModule, normalizeModules, type ModuleKey } from "@/lib/modules";
import { describeDevice, isOrderStatus, type OrderOutcome, type OrderStatus } from "@/lib/orders/labels";
import { readPhoto } from "@/lib/photos/core";
import { publicBaseUrl } from "@/lib/public-url";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Seguimiento público de una orden para el cliente, sin sesión. Lo autoriza el token de la orden
// (64 caracteres hexadecimales) junto con el slug del taller. Solo muestra lo que el cliente puede
// ver: nada de contraseñas del equipo, teléfono del cliente, notas internas ni nombres del personal.

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

export type PublicTracking = {
  business: { name: string; phone: string; address: string };
  order: {
    folio: number;
    status: OrderStatus;
    outcome: OrderOutcome | null;
    device: string;
    reportedIssue: string;
    diagnosis: string;
    promisedOn: string | null;
    createdAt: Date;
    deliveredAt: Date | null;
    warrantyDays: number;
    // Garantía elegida al entregar; NULL en órdenes entregadas antes del catálogo.
    warrantyName: string | null;
    customerFirstName: string;
  };
  events: { status: OrderStatus; createdAt: Date }[];
  // Refacciones por conseguir anotadas al recibir, sin precio, mientras no haya reparación registrada.
  partsToGet: { description: string; quantity: number }[];
  money: {
    estimatedCost: string | null;
    // Sin reparación registrada, el saldo se calcula sobre el presupuesto.
    usesEstimate: boolean;
    total: string;
    paidTotal: string;
    balance: string;
    // Si ya hay refacciones o mano de obra (además del diagnóstico).
    hasWork: boolean;
    // Sin reparación registrada: diagnóstico cobrado, para mostrarlo aparte del presupuesto.
    diagnosis: string | null;
    // Con reparación: parte del diagnóstico que se descuenta; `full` si se descontó completo.
    diagnosisDiscount: { amount: string; full: boolean } | null;
    // Sin reparación aún, el diagnóstico se descontará del presupuesto si se repara.
    diagnosisCreditPending: boolean;
  };
  // null si el taller no tiene el módulo de fotos.
  photos: { id: string }[] | null;
};

type TrackingTenant = { id: string; name: string; modules: ModuleKey[] };

// Taller activo con el módulo de seguimiento encendido.
async function resolveTrackingTenant(slug: string): Promise<TrackingTenant | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const { rows } = await db.query<{ id: string; name: string; modules: string[] }>(
    "SELECT id::text AS id, name, modules FROM tenants WHERE slug = $1 AND status = 'active'",
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  const modules = normalizeModules(row.modules);
  return hasModule(modules, "tracking") ? { id: row.id, name: row.name, modules } : null;
}

type TrackingOrderRow = {
  id: string;
  folio: number;
  status: string;
  outcome: OrderOutcome | null;
  device_type: string;
  brand: string;
  model: string;
  reported_issue: string;
  diagnosis: string;
  promised_on: string | null;
  created_at: Date;
  delivered_at: Date | null;
  warranty_days: number;
  warranty_name: string | null;
  estimated_cost: string | null;
  paid_total: string;
  work_total: string;
  work_lines: number;
  diagnosis_line_total: string;
  diagnosis_fee: string | null;
  diagnosis_credit: boolean | null;
  intake_type: string | null;
  first_name: string;
  business_name: string | null;
  business_phone: string | null;
  business_address: string | null;
};

export async function getPublicTracking(slug: string, token: string): Promise<PublicTracking | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const tenant = await resolveTrackingTenant(slug);
  if (!tenant) return null;

  return withTenantDb(tenant.id, async (client) => {
    const { rows } = await client.query<TrackingOrderRow>(
      `SELECT o.id, o.folio::int AS folio, o.status, o.outcome, o.device_type, o.brand, o.model, o.reported_issue,
              o.diagnosis, o.promised_on::text AS promised_on, o.created_at, o.delivered_at, o.warranty_days,
              o.warranty_name, o.estimated_cost, o.paid_total, c.first_name,
              COALESCE((SELECT sum(l.total) FROM repair_order_lines l
                         WHERE l.order_id = o.id AND NOT l.is_diagnosis), 0)::text AS work_total,
              COALESCE((SELECT sum(l.total) FROM repair_order_lines l
                         WHERE l.order_id = o.id AND l.is_diagnosis), 0)::text AS diagnosis_line_total,
              (SELECT count(*) FROM repair_order_lines l WHERE l.order_id = o.id AND NOT l.is_diagnosis)::int
                AS work_lines,
              o.diagnosis_fee, rs.diagnosis_credit, o.intake_type,
              s.business_name, s.phone AS business_phone, s.address AS business_address
         FROM repair_orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN ticket_settings s ON true
         LEFT JOIN repair_settings rs ON true
        WHERE o.tracking_token = $1`,
      [token],
    );
    const row = rows[0];
    if (!row || !isOrderStatus(row.status)) return null;

    const { rows: eventRows } = await client.query<{ status: string; created_at: Date }>(
      `SELECT status, created_at FROM repair_order_events
        WHERE order_id = $1 AND status IS NOT NULL
        ORDER BY created_at, id`,
      [row.id],
    );

    let photos: { id: string }[] | null = null;
    if (hasModule(tenant.modules, "photos")) {
      const { rows: photoRows } = await client.query<{ id: string }>(
        "SELECT id FROM order_photos WHERE order_id = $1 ORDER BY created_at",
        [row.id],
      );
      photos = photoRows;
    }

    // El total sale de los renglones (refacciones, mano de obra y lo que se cobre del diagnóstico).
    // Sin reparación registrada, el saldo se calcula sobre el presupuesto con la misma regla del
    // diagnóstico: si se descuenta es un cobro mínimo; si no, se suma al presupuesto.
    const workCents = toCents(row.work_total);
    const diagnosisLineCents = toCents(row.diagnosis_line_total);
    const feeCents = row.diagnosis_fee !== null ? toCents(row.diagnosis_fee) : 0;
    const totalCents = workCents + diagnosisLineCents;
    const paidCents = toCents(row.paid_total);
    // Hay reparación registrada aunque sus renglones valgan $0 (p. ej. refacción capturada sin precio).
    const hasWork = row.work_lines > 0;
    const credits = (row.diagnosis_credit ?? true) && row.outcome !== "not_repaired";
    // Las refacciones por conseguir se muestran hasta que se registra la reparación (o si se
    // cancela, nunca).
    let partsToGet: PublicTracking["partsToGet"] = [];
    if (row.intake_type === "order_part" && !hasWork && row.status !== "cancelled") {
      const { rows: partRows } = await client.query<{ description: string; quantity: number }>(
        "SELECT description, quantity FROM repair_order_quoted_parts WHERE order_id = $1 ORDER BY created_at, id",
        [row.id],
      );
      partsToGet = partRows;
    }
    const usesEstimate = !hasWork && row.estimated_cost !== null && row.outcome !== "not_repaired";

    let baseCents = totalCents;
    if (usesEstimate) {
      const estimateCents = toCents(row.estimated_cost ?? "0");
      baseCents = credits ? Math.max(estimateCents, diagnosisLineCents) : estimateCents + diagnosisLineCents;
    }
    const discountCents = hasWork && feeCents > 0 && row.status !== "cancelled" ? feeCents - diagnosisLineCents : 0;

    return {
      business: {
        name: row.business_name || tenant.name,
        phone: row.business_phone ?? "",
        address: row.business_address ?? "",
      },
      order: {
        folio: row.folio,
        status: row.status,
        outcome: row.outcome,
        device: describeDevice({ deviceType: row.device_type, brand: row.brand, model: row.model }),
        reportedIssue: row.reported_issue,
        diagnosis: row.diagnosis,
        promisedOn: row.promised_on,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        warrantyDays: row.warranty_days,
        warrantyName: row.warranty_name,
        customerFirstName: row.first_name.trim().split(/\s+/)[0] ?? "",
      },
      partsToGet,
      events: eventRows.flatMap((event) =>
        isOrderStatus(event.status) ? [{ status: event.status, createdAt: event.created_at }] : [],
      ),
      money: {
        estimatedCost: row.estimated_cost,
        usesEstimate,
        total: fromCents(totalCents),
        paidTotal: fromCents(paidCents),
        balance: fromCents(Math.max(baseCents - paidCents, 0)),
        hasWork,
        diagnosis: !hasWork && diagnosisLineCents > 0 ? fromCents(diagnosisLineCents) : null,
        diagnosisDiscount:
          discountCents > 0 ? { amount: fromCents(discountCents), full: discountCents === feeCents } : null,
        diagnosisCreditPending: usesEstimate && credits && diagnosisLineCents > 0,
      },
      photos,
    };
  });
}

// Foto de la orden del enlace. null si el enlace no es válido, el taller no tiene el módulo de
// fotos o la foto no pertenece a esa orden.
export async function readTrackingPhoto(slug: string, token: string, photoId: string) {
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(photoId)) return null;
  const tenant = await resolveTrackingTenant(slug);
  if (!tenant || !hasModule(tenant.modules, "photos")) return null;

  const belongs = await withTenantDb(tenant.id, async (client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM order_photos p
         JOIN repair_orders o ON o.id = p.order_id
        WHERE p.id = $1 AND o.tracking_token = $2`,
      [photoId, token],
    );
    return rows.length > 0;
  });
  return belongs ? readPhoto(tenant.id, photoId) : null;
}

// Token de seguimiento de una orden del taller de la sesión.
export async function getTrackingToken(tenantId: string, orderId: string) {
  if (!UUID_PATTERN.test(orderId)) return null;
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ tracking_token: string }>(
      "SELECT tracking_token FROM repair_orders WHERE id = $1",
      [orderId],
    );
    return rows[0]?.tracking_token ?? null;
  });
}

export async function buildTrackingUrl(slug: string, token: string) {
  return `${await publicBaseUrl()}/s/${encodeURIComponent(slug)}/${token}`;
}

// Enlace público de seguimiento de una orden, o null si la orden no existe.
export async function getOrderTrackingUrl(tenantId: string, slug: string, orderId: string) {
  const token = await getTrackingToken(tenantId, orderId);
  return token ? buildTrackingUrl(slug, token) : null;
}
