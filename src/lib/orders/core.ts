import "server-only";
import type { PoolClient } from "pg";
import {
  assertCashAvailable,
  findOpenShiftId,
  validatePayments,
  type CashActor,
  type PaymentInput,
  type SellableItem,
} from "@/lib/cash/core";
import type { PaymentMethod } from "@/lib/cash/labels";
import { computeLine, fromCents, toCents } from "@/lib/cash/money";
import { applyStockMovement } from "@/lib/inventory/core";
import { formatMoney } from "@/lib/inventory/format";
import {
  ORDER_STATUS_LABELS,
  WORK_TRANSITIONS,
  describeDevice,
  type OrderOutcome,
  type OrderPaymentKind,
  type OrderStatus,
  type OrderView,
  type UnlockType,
} from "@/lib/orders/labels";
import { attachUploadSession } from "@/lib/photos/core";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Órdenes de reparación: recepción, trabajo del técnico (refacciones y mano de obra),
// anticipos, entrega y cancelación. Todo corre en el schema del taller. No verifica la
// sesión: la acción o página que llama ya comprobó los permisos.

export type OrderInput = {
  customerId: string;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  unlockType: UnlockType;
  unlockCode: string;
  accessories: string;
  deviceCondition: string;
  reportedIssue: string;
  estimatedCents: number | null;
  promisedOn: string | null;
  warrantyDays: number;
};

export type OrderSummary = {
  id: string;
  folio: number;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber: string;
  technicianName: string;
  total: string;
  paidTotal: string;
  promisedOn: string | null;
  createdAt: Date;
};

export type OrderLine = {
  id: string;
  kind: "part" | "labor";
  itemId: string | null;
  description: string;
  quantity: number;
  // En refacciones: precio de la pieza y mano de obra por pieza; el total incluye ambas.
  unitPrice: string;
  laborPrice: string;
  taxRate: string;
  taxIncluded: boolean;
  subtotal: string;
  taxAmount: string;
  total: string;
  userName: string;
  createdAt: Date;
};

export type OrderPayment = {
  id: string;
  kind: OrderPaymentKind;
  method: PaymentMethod;
  amount: string;
  reference: string;
  bankName: string | null;
  cashReceived: string | null;
  changeAmount: string;
  userName: string;
  createdAt: Date;
};

export type OrderEvent = { id: string; status: OrderStatus | null; note: string; userName: string; createdAt: Date };

export type OrderPurchaseLine = {
  purchaseId: string;
  folio: number;
  itemName: string;
  quantity: number;
  supplierName: string;
  purchasedOn: string;
};

export type OrderDetail = OrderSummary & {
  customerId: string;
  customerEmail: string;
  outcome: OrderOutcome | null;
  color: string;
  unlockType: UnlockType;
  unlockCode: string;
  accessories: string;
  deviceCondition: string;
  reportedIssue: string;
  diagnosis: string;
  estimatedCost: string | null;
  warrantyDays: number;
  technicianId: string | null;
  cancelReason: string;
  createdByName: string;
  updatedAt: Date;
  deliveredAt: Date | null;
  subtotal: string;
  taxTotal: string;
  lines: OrderLine[];
  payments: OrderPayment[];
  events: OrderEvent[];
  purchases: OrderPurchaseLine[];
};

export type RepairItem = SellableItem & { laborPrice: string };

// Error con un mensaje apto para mostrarse en la interfaz.
export class OrderError extends Error {}

function assertIds(...ids: (string | null)[]) {
  if (ids.some((id) => id !== null && !UUID_PATTERN.test(id))) throw new OrderError("Solicitud no válida.");
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function normalizeMoney(value: string) {
  return fromCents(toCents(value));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

type SummaryRow = {
  id: string;
  folio: number;
  status: OrderStatus;
  device_type: string;
  brand: string;
  model: string;
  serial_number: string;
  technician_name: string;
  paid_total: string;
  promised_on: string | null;
  created_at: Date;
  customer_name: string;
  customer_phone: string;
  total: string;
};

const SUMMARY_SELECT = `
  SELECT o.id, o.folio::int AS folio, o.status, o.device_type, o.brand, o.model, o.serial_number,
         o.technician_name, o.paid_total, o.promised_on::text AS promised_on, o.created_at,
         btrim(c.first_name || ' ' || c.last_name) AS customer_name, c.phone AS customer_phone,
         COALESCE((SELECT sum(l.total) FROM repair_order_lines l WHERE l.order_id = o.id), 0) AS total
    FROM repair_orders o
    JOIN customers c ON c.id = o.customer_id`;

function mapSummary(row: SummaryRow): OrderSummary {
  return {
    id: row.id,
    folio: row.folio,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deviceType: row.device_type,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    technicianName: row.technician_name,
    total: normalizeMoney(String(row.total)),
    paidTotal: row.paid_total,
    promisedOn: row.promised_on,
    createdAt: row.created_at,
  };
}

async function loadViewCounts(client: PoolClient, userId: string): Promise<Record<OrderView, number>> {
  const { rows } = await client.query<Record<OrderView, number>>(
    `SELECT count(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled'))::int AS active,
            count(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled') AND technician_id IS NULL)::int AS unassigned,
            count(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled') AND technician_id = $1)::int AS mine,
            count(*) FILTER (WHERE status = 'ready')::int AS ready,
            count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
       FROM repair_orders`,
    [userId],
  );
  return rows[0];
}

export async function listOrders(
  tenantId: string,
  options: { view: OrderView; search: string; userId: string },
): Promise<{ orders: OrderSummary[]; counts: Record<OrderView, number> }> {
  return withTenantDb(tenantId, async (client) => {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const active = "o.status NOT IN ('delivered', 'cancelled')";

    switch (options.view) {
      case "active":
        conditions.push(active);
        break;
      case "unassigned":
        conditions.push(active, "o.technician_id IS NULL");
        break;
      case "mine":
        params.push(options.userId);
        conditions.push(active, `o.technician_id = $${params.length}`);
        break;
      default:
        params.push(options.view);
        conditions.push(`o.status = $${params.length}`);
    }

    const search = options.search.trim().slice(0, 100);
    if (search) {
      const folio = search.replace(/^#/, "");
      params.push(/^\d{1,12}$/.test(folio) ? folio : null, `%${escapeLike(search)}%`);
      const text = `$${params.length}`;
      conditions.push(
        `(o.folio::text = $${params.length - 1} OR btrim(c.first_name || ' ' || c.last_name) ILIKE ${text}
          OR c.phone ILIKE ${text} OR o.serial_number ILIKE ${text} OR (o.brand || ' ' || o.model) ILIKE ${text})`,
      );
    }

    // Las órdenes en proceso salen en orden de llegada (la cola); las cerradas, las más recientes primero.
    const closedView = options.view === "delivered" || options.view === "cancelled";
    const { rows } = await client.query<SummaryRow>(
      `${SUMMARY_SELECT}
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${closedView ? "o.updated_at DESC" : "o.created_at"}
        LIMIT 200`,
      params,
    );

    return { orders: rows.map(mapSummary), counts: await loadViewCounts(client, options.userId) };
  });
}

export async function getOrderCounts(tenantId: string, userId: string) {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ status: OrderStatus; count: number }>(
      `SELECT status, count(*)::int AS count
         FROM repair_orders
        WHERE status NOT IN ('delivered', 'cancelled')
        GROUP BY status`,
    );
    const byStatus: Partial<Record<OrderStatus, number>> = {};
    for (const row of rows) byStatus[row.status] = row.count;
    return { views: await loadViewCounts(client, userId), byStatus };
  });
}

export async function listCustomerOrders(tenantId: string, customerId: string): Promise<OrderSummary[]> {
  if (!UUID_PATTERN.test(customerId)) return [];
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<SummaryRow>(
      `${SUMMARY_SELECT} WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
      [customerId],
    );
    return rows.map(mapSummary);
  });
}

export async function getOrder(tenantId: string, orderId: string): Promise<OrderDetail | null> {
  if (!UUID_PATTERN.test(orderId)) return null;

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<
      SummaryRow & {
        customer_id: string;
        customer_email: string;
        outcome: OrderOutcome | null;
        color: string;
        unlock_type: UnlockType;
        unlock_code: string;
        accessories: string;
        device_condition: string;
        reported_issue: string;
        diagnosis: string;
        estimated_cost: string | null;
        warranty_days: number;
        technician_id: string | null;
        cancel_reason: string;
        created_by_name: string;
        updated_at: Date;
        delivered_at: Date | null;
      }
    >(
      `SELECT o.id, o.folio::int AS folio, o.status, o.device_type, o.brand, o.model, o.serial_number,
              o.technician_name, o.paid_total, o.promised_on::text AS promised_on, o.created_at,
              btrim(c.first_name || ' ' || c.last_name) AS customer_name, c.phone AS customer_phone,
              0 AS total, o.customer_id, c.email AS customer_email, o.outcome, o.color, o.unlock_type, o.unlock_code,
              o.accessories, o.device_condition, o.reported_issue, o.diagnosis, o.estimated_cost,
              o.warranty_days, o.technician_id, o.cancel_reason, o.created_by_name, o.updated_at, o.delivered_at
         FROM repair_orders o
         JOIN customers c ON c.id = o.customer_id
        WHERE o.id = $1`,
      [orderId],
    );
    const row = rows[0];
    if (!row) return null;

    const { rows: lineRows } = await client.query<{
      id: string;
      kind: "part" | "labor";
      item_id: string | null;
      description: string;
      quantity: number;
      unit_price: string;
      labor_price: string;
      tax_rate: string;
      tax_included: boolean;
      subtotal: string;
      tax_amount: string;
      total: string;
      user_name: string;
      created_at: Date;
    }>(
      `SELECT id, kind, item_id, description, quantity, unit_price, labor_price, tax_rate, tax_included, subtotal, tax_amount,
              total, user_name, created_at
         FROM repair_order_lines WHERE order_id = $1 ORDER BY kind DESC, created_at`,
      [orderId],
    );

    const { rows: paymentRows } = await client.query<{
      id: string;
      kind: OrderPaymentKind;
      method: PaymentMethod;
      amount: string;
      reference: string;
      bank_name: string | null;
      cash_received: string | null;
      change_amount: string;
      user_name: string;
      created_at: Date;
    }>(
      `SELECT p.id, p.kind, p.method, p.amount, p.reference, b.bank_name, p.cash_received, p.change_amount,
              p.user_name, p.created_at
         FROM repair_order_payments p
         LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
        WHERE p.order_id = $1
        ORDER BY p.created_at`,
      [orderId],
    );

    const { rows: eventRows } = await client.query<{
      id: string;
      status: OrderStatus | null;
      note: string;
      user_name: string;
      created_at: Date;
    }>(
      "SELECT id, status, note, user_name, created_at FROM repair_order_events WHERE order_id = $1 ORDER BY created_at DESC",
      [orderId],
    );

    const { rows: purchaseRows } = await client.query<{
      purchase_id: string;
      folio: number;
      item_name: string;
      quantity: number;
      supplier_name: string;
      purchased_on: string;
    }>(
      `SELECT p.id AS purchase_id, p.folio::int AS folio, pi.item_name, pi.quantity, s.name AS supplier_name,
              p.purchased_on::text AS purchased_on
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         JOIN suppliers s ON s.id = p.supplier_id
        WHERE pi.repair_order_id = $1
        ORDER BY p.created_at DESC`,
      [orderId],
    );

    const lines: OrderLine[] = lineRows.map((line) => ({
      id: line.id,
      kind: line.kind,
      itemId: line.item_id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      laborPrice: line.labor_price,
      taxRate: line.tax_rate,
      taxIncluded: line.tax_included,
      subtotal: line.subtotal,
      taxAmount: line.tax_amount,
      total: line.total,
      userName: line.user_name,
      createdAt: line.created_at,
    }));

    return {
      ...mapSummary(row),
      total: fromCents(sumCents(lines.map((line) => toCents(line.total)))),
      subtotal: fromCents(sumCents(lines.map((line) => toCents(line.subtotal)))),
      taxTotal: fromCents(sumCents(lines.map((line) => toCents(line.taxAmount)))),
      customerId: row.customer_id,
      customerEmail: row.customer_email,
      outcome: row.outcome,
      color: row.color,
      unlockType: row.unlock_type,
      unlockCode: row.unlock_code,
      accessories: row.accessories,
      deviceCondition: row.device_condition,
      reportedIssue: row.reported_issue,
      diagnosis: row.diagnosis,
      estimatedCost: row.estimated_cost,
      warrantyDays: row.warranty_days,
      technicianId: row.technician_id,
      cancelReason: row.cancel_reason,
      createdByName: row.created_by_name,
      updatedAt: row.updated_at,
      deliveredAt: row.delivered_at,
      lines,
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        kind: payment.kind,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
        bankName: payment.bank_name,
        cashReceived: payment.cash_received,
        changeAmount: payment.change_amount,
        userName: payment.user_name,
        createdAt: payment.created_at,
      })),
      events: eventRows.map((event) => ({
        id: event.id,
        status: event.status,
        note: event.note,
        userName: event.user_name,
        createdAt: event.created_at,
      })),
      purchases: purchaseRows.map((purchase) => ({
        purchaseId: purchase.purchase_id,
        folio: purchase.folio,
        itemName: purchase.item_name,
        quantity: purchase.quantity,
        supplierName: purchase.supplier_name,
        purchasedOn: purchase.purchased_on,
      })),
    };
  });
}

// Refacciones que se pueden usar en una reparación, para el buscador del técnico.
export async function searchRepairItems(tenantId: string, query: string): Promise<RepairItem[]> {
  const search = query.trim().slice(0, 100);

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      name: string;
      barcode: string | null;
      sale_price: string;
      tax_rate: string;
      tax_included: boolean;
      track_stock: boolean;
      stock: number;
      labor_price: string;
    }>(
      `SELECT id, name, barcode, sale_price, tax_rate, tax_included, track_stock, stock, labor_price
         FROM items
        WHERE is_active AND (is_repair_part OR is_for_sale) AND (name ILIKE $1 OR barcode = $2)
        ORDER BY is_repair_part DESC, (barcode = $2) DESC NULLS LAST, lower(name)
        LIMIT 20`,
      [`%${escapeLike(search)}%`, search],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      barcode: row.barcode,
      salePrice: row.sale_price,
      taxRate: row.tax_rate,
      taxIncluded: row.tax_included,
      trackStock: row.track_stock,
      stock: row.stock,
      laborPrice: row.labor_price,
    }));
  });
}

// Órdenes en proceso, para ligar una compra de refacciones.
export async function searchOrderOptions(tenantId: string, query: string) {
  const search = query.trim().slice(0, 100);

  return withTenantDb(tenantId, async (client) => {
    const params: string[] = [];
    let condition = "";
    if (search) {
      params.push(search.replace(/^#/, ""), `%${escapeLike(search)}%`);
      condition = `AND (o.folio::text = $1 OR btrim(c.first_name || ' ' || c.last_name) ILIKE $2
                        OR (o.brand || ' ' || o.model) ILIKE $2)`;
    }
    const { rows } = await client.query<{
      id: string;
      folio: number;
      device_type: string;
      brand: string;
      model: string;
      customer_name: string;
    }>(
      `SELECT o.id, o.folio::int AS folio, o.device_type, o.brand, o.model,
              btrim(c.first_name || ' ' || c.last_name) AS customer_name
         FROM repair_orders o
         JOIN customers c ON c.id = o.customer_id
        WHERE o.status NOT IN ('delivered', 'cancelled') ${condition}
        ORDER BY o.created_at DESC
        LIMIT 20`,
      params,
    );
    return rows.map((row) => ({
      value: row.id,
      label: `#${row.folio} · ${describeDevice({ deviceType: row.device_type, brand: row.brand, model: row.model })}`,
      detail: row.customer_name,
    }));
  });
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

type LockedOrder = {
  id: string;
  folio: number;
  status: OrderStatus;
  technician_id: string | null;
  technician_name: string;
  paid_total: string;
};

async function lockOrder(client: PoolClient, orderId: string): Promise<LockedOrder> {
  const { rows } = await client.query<LockedOrder>(
    `SELECT id, folio::int AS folio, status, technician_id, technician_name, paid_total
       FROM repair_orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );
  if (!rows[0]) throw new OrderError("La orden ya no existe.");
  return rows[0];
}

function assertActive(order: LockedOrder) {
  if (order.status === "delivered") throw new OrderError("La orden ya se entregó.");
  if (order.status === "cancelled") throw new OrderError("La orden está cancelada.");
}

// `override`: el propietario puede trabajar cualquier orden, aunque no la haya tomado.
type WorkOptions = { override: boolean };
const NO_OVERRIDE: WorkOptions = { override: false };

// Una orden es del técnico que la tomó: solo él la trabaja mientras no la devuelva a la cola.
function assertAssigned(order: LockedOrder, actor: CashActor, options: WorkOptions) {
  if (options.override || order.technician_id === actor.userId) return;
  throw new OrderError(
    order.technician_id
      ? `Esta orden la tiene ${order.technician_name || "otro técnico"}.`
      : "Toma la orden para poder trabajarla.",
  );
}

async function addEvent(client: PoolClient, actor: CashActor, orderId: string, status: OrderStatus | null, note: string) {
  await client.query(
    "INSERT INTO repair_order_events (order_id, status, note, user_id, user_name) VALUES ($1, $2, $3, $4, $5)",
    [orderId, status, note.slice(0, 500), actor.userId, actor.userName],
  );
}

async function assertCustomer(client: PoolClient, customerId: string) {
  const { rows } = await client.query<{ is_active: boolean }>("SELECT is_active FROM customers WHERE id = $1", [
    customerId,
  ]);
  if (!rows[0]?.is_active) throw new OrderError("Elige un cliente registrado.");
}

async function loadTotalCents(client: PoolClient, orderId: string) {
  const { rows } = await client.query<{ total: string }>(
    "SELECT COALESCE(sum(total), 0) AS total FROM repair_order_lines WHERE order_id = $1",
    [orderId],
  );
  return toCents(String(rows[0].total));
}

function orderValues(input: OrderInput) {
  return [
    input.customerId,
    input.deviceType,
    input.brand,
    input.model,
    input.serialNumber,
    input.color,
    input.unlockCode,
    input.accessories,
    input.deviceCondition,
    input.reportedIssue,
    input.estimatedCents === null ? null : fromCents(input.estimatedCents),
    input.promisedOn,
    input.warrantyDays,
    input.unlockType,
  ];
}

export async function createOrder(
  tenantId: string,
  actor: CashActor,
  input: OrderInput,
  // Enlaces de fotos generados durante la recepción: sus fotos quedan ligadas a la orden.
  options: { photoSessionIds: string[] } = { photoSessionIds: [] },
) {
  assertIds(input.customerId, ...options.photoSessionIds);

  return withTenantDb(tenantId, async (client) => {
    await assertCustomer(client, input.customerId);
    const { rows } = await client.query<{ id: string; folio: number }>(
      `INSERT INTO repair_orders (customer_id, device_type, brand, model, serial_number, color, unlock_code,
                                  accessories, device_condition, reported_issue, estimated_cost, promised_on,
                                  warranty_days, unlock_type, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id, folio::int AS folio`,
      [...orderValues(input), actor.userId, actor.userName],
    );
    await addEvent(client, actor, rows[0].id, "received", "");
    for (const sessionId of options.photoSessionIds) {
      await attachUploadSession(client, sessionId, rows[0].id);
    }
    return rows[0];
  });
}

export async function updateOrder(tenantId: string, orderId: string, input: OrderInput) {
  assertIds(orderId, input.customerId);

  await withTenantDb(tenantId, async (client) => {
    assertActive(await lockOrder(client, orderId));
    await assertCustomer(client, input.customerId);
    await client.query(
      `UPDATE repair_orders
          SET customer_id = $1, device_type = $2, brand = $3, model = $4, serial_number = $5, color = $6,
              unlock_code = $7, accessories = $8, device_condition = $9, reported_issue = $10,
              estimated_cost = $11, promised_on = $12, warranty_days = $13, unlock_type = $14
        WHERE id = $15`,
      [...orderValues(input), orderId],
    );
  });
}

export async function updateDiagnosis(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  // Sin `estimatedCents` (técnicos, que no ven precios) el presupuesto no se modifica.
  input: { diagnosis: string; estimatedCents?: number | null; promisedOn: string | null },
  options: WorkOptions = NO_OVERRIDE,
) {
  assertIds(orderId);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    assertAssigned(order, actor, options);
    if (input.estimatedCents === undefined) {
      await client.query("UPDATE repair_orders SET diagnosis = $1, promised_on = $2 WHERE id = $3", [
        input.diagnosis,
        input.promisedOn,
        orderId,
      ]);
    } else {
      await client.query("UPDATE repair_orders SET diagnosis = $1, estimated_cost = $2, promised_on = $3 WHERE id = $4", [
        input.diagnosis,
        input.estimatedCents === null ? null : fromCents(input.estimatedCents),
        input.promisedOn,
        orderId,
      ]);
    }
  });
}

// El técnico toma la orden de la cola. Solo el propietario puede quitársela a otro técnico.
export async function takeOrder(tenantId: string, actor: CashActor, orderId: string, options: { allowReassign: boolean }) {
  assertIds(orderId);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    if (order.technician_id === actor.userId) throw new OrderError("Ya tienes asignada esta orden.");
    if (order.technician_id && !options.allowReassign) {
      throw new OrderError(`La orden ya la tomó ${order.technician_name || "otro técnico"}.`);
    }

    const status: OrderStatus = order.status === "received" ? "diagnosing" : order.status;
    await client.query("UPDATE repair_orders SET technician_id = $1, technician_name = $2, status = $3 WHERE id = $4", [
      actor.userId,
      actor.userName,
      status,
      orderId,
    ]);
    await addEvent(client, actor, orderId, status === order.status ? null : status, `Asignada a ${actor.userName}`);
  });
}

// Devuelve la orden a la cola para que la tome otro técnico. Se conservan estado, refacciones
// y mano de obra; el motivo queda en el historial para el siguiente técnico.
export async function releaseOrder(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { reason: string },
  options: WorkOptions = NO_OVERRIDE,
) {
  assertIds(orderId);
  if (!input.reason) throw new OrderError("Escribe por qué la devuelves; le sirve al siguiente técnico.");

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    if (!order.technician_id) throw new OrderError("La orden ya está en la cola.");
    if (order.status === "ready") {
      throw new OrderError("La orden ya está lista para entregar; no se puede devolver a la cola.");
    }
    assertAssigned(order, actor, options);

    await client.query("UPDATE repair_orders SET technician_id = NULL, technician_name = '' WHERE id = $1", [orderId]);
    const previous = order.technician_id === actor.userId ? "" : ` (la tenía ${order.technician_name})`;
    await addEvent(client, actor, orderId, null, `Devuelta a la cola${previous}: ${input.reason}`);
  });
}

export async function changeStatus(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { status: OrderStatus; outcome: OrderOutcome | null; note: string },
  options: WorkOptions = NO_OVERRIDE,
) {
  assertIds(orderId);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    assertAssigned(order, actor, options);
    if (!WORK_TRANSITIONS[order.status].includes(input.status)) {
      throw new OrderError(
        `No se puede pasar de “${ORDER_STATUS_LABELS[order.status]}” a “${ORDER_STATUS_LABELS[input.status]}”.`,
      );
    }
    if (input.status === "ready" && !input.outcome) throw new OrderError("Indica si el equipo quedó reparado.");

    // Si el propietario trabaja una orden que nadie había tomado, queda asignada a él.
    await client.query(
      `UPDATE repair_orders
          SET status = $1, outcome = $2,
              technician_name = CASE WHEN technician_id IS NULL THEN $4 ELSE technician_name END,
              technician_id = COALESCE(technician_id, $3)
        WHERE id = $5`,
      [input.status, input.status === "ready" ? input.outcome : null, actor.userId, actor.userName, orderId],
    );
    await addEvent(client, actor, orderId, input.status, input.note);
  });
}

export async function addPart(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { itemId: string; quantity: number },
  options: WorkOptions = NO_OVERRIDE,
) {
  assertIds(orderId, input.itemId);
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000) {
    throw new OrderError("Cantidad no válida.");
  }

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    assertAssigned(order, actor, options);

    const { rows } = await client.query<{
      id: string;
      name: string;
      sale_price: string;
      tax_rate: string;
      tax_included: boolean;
      track_stock: boolean;
      stock: number;
      is_active: boolean;
      is_for_sale: boolean;
      is_repair_part: boolean;
      labor_price: string;
    }>(
      `SELECT id, name, sale_price, tax_rate, tax_included, track_stock, stock, is_active, is_for_sale, is_repair_part,
              labor_price
         FROM items WHERE id = $1 FOR UPDATE`,
      [input.itemId],
    );
    const item = rows[0];
    if (!item || !item.is_active || !(item.is_repair_part || item.is_for_sale)) {
      throw new OrderError("El artículo ya no está disponible.");
    }
    if (item.track_stock && item.stock < input.quantity) {
      throw new OrderError(`No hay suficientes existencias de ${item.name} (quedan ${item.stock}).`);
    }

    // Se cobra la pieza más su mano de obra, con el IVA del artículo.
    const amounts = computeLine({
      unitPriceCents: toCents(item.sale_price) + toCents(item.labor_price),
      quantity: input.quantity,
      taxRate: Number(item.tax_rate),
      taxIncluded: item.tax_included,
    });

    // Se descuenta del inventario en cuanto se agrega a la orden.
    if (item.track_stock) {
      await applyStockMovement(client, actor, item.id, {
        kind: "repair",
        quantity: -input.quantity,
        unitCost: null,
        supplierId: null,
        note: `Orden #${order.folio}`,
      });
    }

    await client.query(
      `INSERT INTO repair_order_lines (order_id, kind, item_id, description, track_stock, quantity, unit_price,
                                       tax_rate, tax_included, subtotal, tax_amount, total, user_id, user_name,
                                       labor_price)
       VALUES ($1, 'part', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        orderId,
        item.id,
        item.name,
        item.track_stock,
        input.quantity,
        item.sale_price,
        item.tax_rate,
        item.tax_included,
        fromCents(amounts.subtotal),
        fromCents(amounts.tax),
        fromCents(amounts.total),
        actor.userId,
        actor.userName,
        item.labor_price,
      ],
    );
  });
}

export async function addLabor(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { description: string; priceCents: number; taxRate: number; taxIncluded: boolean },
  options: WorkOptions = NO_OVERRIDE,
) {
  assertIds(orderId);
  if (!input.description) throw new OrderError("Describe el trabajo.");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new OrderError("Precio no válido.");
  if (!(input.taxRate >= 0 && input.taxRate <= 100)) throw new OrderError("IVA no válido.");

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    assertAssigned(order, actor, options);
    const amounts = computeLine({
      unitPriceCents: input.priceCents,
      quantity: 1,
      taxRate: input.taxRate,
      taxIncluded: input.taxIncluded,
    });
    await client.query(
      `INSERT INTO repair_order_lines (order_id, kind, description, quantity, unit_price, tax_rate, tax_included,
                                       subtotal, tax_amount, total, user_id, user_name)
       VALUES ($1, 'labor', $2, 1, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        orderId,
        input.description,
        fromCents(input.priceCents),
        input.taxRate,
        input.taxIncluded,
        fromCents(amounts.subtotal),
        fromCents(amounts.tax),
        fromCents(amounts.total),
        actor.userId,
        actor.userName,
      ],
    );
  });
}

type LineRow = { kind: "part" | "labor"; item_id: string | null; description: string; track_stock: boolean; quantity: number };

// Regresa al inventario una refacción descontada. Devuelve si hubo movimiento.
async function returnPartToStock(client: PoolClient, actor: CashActor, line: LineRow, note: string) {
  if (line.kind !== "part" || !line.track_stock || !line.item_id) return false;
  const { rows } = await client.query<{ track_stock: boolean }>("SELECT track_stock FROM items WHERE id = $1", [
    line.item_id,
  ]);
  if (!rows[0]?.track_stock) return false;
  await applyStockMovement(
    client,
    actor,
    line.item_id,
    { kind: "repair_return", quantity: line.quantity, unitCost: null, supplierId: null, note },
    { requireActive: false },
  );
  return true;
}

export async function removeLine(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  lineId: string,
  // `allowLabor`: quien maneja los cobros puede quitar mano de obra de cualquier orden.
  options: WorkOptions & { allowLabor: boolean } = { ...NO_OVERRIDE, allowLabor: false },
) {
  assertIds(orderId, lineId);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    const { rows } = await client.query<LineRow>(
      "SELECT kind, item_id, description, track_stock, quantity FROM repair_order_lines WHERE id = $1 AND order_id = $2 FOR UPDATE",
      [lineId, orderId],
    );
    const line = rows[0];
    if (!line) throw new OrderError("El renglón ya no existe.");

    // Las refacciones las quita el técnico de la orden; la mano de obra, quien maneja los cobros.
    if (line.kind === "labor") {
      if (!options.allowLabor) throw new OrderError("La mano de obra solo la quita quien maneja los cobros.");
    } else {
      assertAssigned(order, actor, options);
    }

    await returnPartToStock(client, actor, line, `Se quitó de la orden #${order.folio}`);
    await client.query("DELETE FROM repair_order_lines WHERE id = $1", [lineId]);
  });
}

async function insertPayments(
  client: PoolClient,
  actor: CashActor,
  orderId: string,
  shiftId: string,
  kind: OrderPaymentKind,
  payments: PaymentInput[],
  cash: { cashReceived: number | null; change: number },
) {
  for (const payment of payments) {
    const isCashIn = payment.method === "cash" && kind !== "refund";
    await client.query(
      `INSERT INTO repair_order_payments (order_id, shift_id, kind, method, amount, bank_account_id, reference,
                                          cash_received, change_amount, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        orderId,
        shiftId,
        kind,
        payment.method,
        fromCents(payment.amountCents),
        payment.method === "transfer" ? payment.bankAccountId : null,
        payment.reference,
        isCashIn && cash.cashReceived !== null ? fromCents(cash.cashReceived) : null,
        isCashIn ? fromCents(cash.change) : "0.00",
        actor.userId,
        actor.userName,
      ],
    );
  }
}

// Anticipo o abono antes de entregar. Entra al turno de caja abierto.
export async function addOrderPayment(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { payments: PaymentInput[]; cashReceivedCents: number | null },
) {
  assertIds(orderId, ...input.payments.map((payment) => payment.bankAccountId));
  if (input.payments.length === 0) throw new OrderError("Agrega al menos un pago.");

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client, true);
    if (!shiftId) throw new OrderError("Abre la caja para registrar cobros.");
    const order = await lockOrder(client, orderId);
    assertActive(order);

    const amount = sumCents(input.payments.map((payment) => payment.amountCents));
    const cash = await validatePayments(client, input.payments, {
      totalCents: amount,
      cashReceivedCents: input.cashReceivedCents,
    });
    await insertPayments(client, actor, orderId, shiftId, "deposit", input.payments, cash);
    await client.query("UPDATE repair_orders SET paid_total = paid_total + $1 WHERE id = $2", [fromCents(amount), orderId]);

    return { amount: fromCents(amount), change: fromCents(cash.change) };
  });
}

// Entrega el equipo: cobra el saldo (o reembolsa si se pagó de más) y cierra la orden.
export async function deliverOrder(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { payments: PaymentInput[]; cashReceivedCents: number | null; refundMethod: PaymentMethod | null },
) {
  assertIds(orderId, ...input.payments.map((payment) => payment.bankAccountId));

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client, true);
    const order = await lockOrder(client, orderId);
    assertActive(order);
    if (order.status !== "ready") throw new OrderError("Marca la orden como lista para entregar antes de entregarla.");

    const total = await loadTotalCents(client, orderId);
    const balance = total - toCents(order.paid_total);
    let change = 0;

    if (balance > 0) {
      if (!shiftId) throw new OrderError("Abre la caja para cobrar el saldo.");
      const cash = await validatePayments(client, input.payments, {
        totalCents: balance,
        cashReceivedCents: input.cashReceivedCents,
      });
      await insertPayments(client, actor, orderId, shiftId, "payment", input.payments, cash);
      change = cash.change;
    } else if (input.payments.length > 0) {
      throw new OrderError("La orden no tiene saldo por cobrar.");
    }

    if (balance < 0) {
      const refund = -balance;
      if (!input.refundMethod) {
        throw new OrderError(`Elige cómo se reembolsan ${formatMoney(fromCents(refund))} al cliente.`);
      }
      if (!shiftId) throw new OrderError("Abre la caja para registrar el reembolso.");
      if (input.refundMethod === "cash") await assertCashAvailable(client, shiftId, refund, "para reembolsar");
      await insertPayments(
        client,
        actor,
        orderId,
        shiftId,
        "refund",
        [{ method: input.refundMethod, amountCents: refund, bankAccountId: null, reference: "" }],
        { cashReceived: null, change: 0 },
      );
    }

    await client.query(
      "UPDATE repair_orders SET status = 'delivered', delivered_at = now(), paid_total = $1 WHERE id = $2",
      [fromCents(total), orderId],
    );
    await addEvent(client, actor, orderId, "delivered", "");

    return { folio: order.folio, change: fromCents(change) };
  });
}

// Cancela la orden: las refacciones regresan al inventario y lo pagado se reembolsa completo.
export async function cancelOrder(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { reason: string; refundMethod: PaymentMethod | null },
) {
  assertIds(orderId);
  if (!input.reason) throw new OrderError("Escribe el motivo de la cancelación.");

  await withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client, true);
    const order = await lockOrder(client, orderId);
    assertActive(order);

    const paid = toCents(order.paid_total);
    if (paid > 0) {
      if (!input.refundMethod) {
        throw new OrderError(`Elige cómo se reembolsan los ${formatMoney(order.paid_total)} pagados.`);
      }
      if (!shiftId) throw new OrderError("Abre la caja para registrar el reembolso.");
      if (input.refundMethod === "cash") await assertCashAvailable(client, shiftId, paid, "para reembolsar");
      await insertPayments(
        client,
        actor,
        orderId,
        shiftId,
        "refund",
        [{ method: input.refundMethod, amountCents: paid, bankAccountId: null, reference: "" }],
        { cashReceived: null, change: 0 },
      );
    }

    const { rows: lines } = await client.query<LineRow>(
      `SELECT kind, item_id, description, track_stock, quantity
         FROM repair_order_lines WHERE order_id = $1 ORDER BY item_id FOR UPDATE`,
      [orderId],
    );
    const returned: string[] = [];
    for (const line of lines) {
      if (await returnPartToStock(client, actor, line, `Orden #${order.folio} cancelada`)) {
        returned.push(`${line.quantity} × ${line.description}`);
      }
    }
    await client.query("DELETE FROM repair_order_lines WHERE order_id = $1", [orderId]);

    await client.query(
      "UPDATE repair_orders SET status = 'cancelled', outcome = NULL, paid_total = 0, cancel_reason = $1 WHERE id = $2",
      [input.reason, orderId],
    );
    await addEvent(
      client,
      actor,
      orderId,
      "cancelled",
      returned.length > 0 ? `${input.reason} · Regresó al inventario: ${returned.join(", ")}` : input.reason,
    );
  });
}
