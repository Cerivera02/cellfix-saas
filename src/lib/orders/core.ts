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
  DIAGNOSIS_LINE_DESCRIPTION,
  INTAKE_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  WORK_TRANSITIONS,
  describeDevice,
  type IntakeType,
  type OrderOutcome,
  type OrderPaymentKind,
  type OrderStatus,
  type OrderView,
  type UnlockType,
} from "@/lib/orders/labels";
import { attachUploadSession } from "@/lib/photos/core";
import { readRepairSettings } from "@/lib/settings/core";
import { withTenantDb } from "@/lib/tenancy/db";
import { findActiveWarranty, hasActiveWarranties, type WarrantyInput } from "@/lib/warranties/core";
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
};

// Tipo de ingreso y cobro al recibir el equipo. No se modifica al editar la orden.
export type OrderIntake = {
  type: IntakeType;
  // Solo en diagnóstico: costo en centavos (0 = diagnóstico gratis).
  diagnosisFeeCents: number;
  // Anticipo o pago del diagnóstico; null si no se cobra al recibir.
  payment: { payments: PaymentInput[]; cashReceivedCents: number | null } | null;
  // Si quien recibe puede cobrar: sin ese permiso la orden se registra sin cobro.
  canCollect: boolean;
  // Refacción en existencia: artículos del inventario que se agregan como renglones (el precio
  // sale del artículo) o, sin el módulo de Inventario, la refacción capturada a mano.
  parts: IntakePart[];
  freePart: FreeLineInput | null;
  // Refacción por conseguir: piezas que hay que conseguir, sin precio; no son renglones ni mueven
  // inventario.
  partsToGet: PartToGetInput[];
};

export type IntakePart = { itemId: string; quantity: number };

// Pieza por conseguir: del inventario (el nombre lo pone el servidor) o descrita a mano.
export type PartToGetInput = { itemId: string | null; description: string; quantity: number };

export type OrderPartToGet = { id: string; itemId: string | null; description: string; quantity: number };

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
  // Renglón del diagnóstico cobrado al recibir; no se quita a mano.
  isDiagnosis: boolean;
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
  // Garantía elegida al entregar (copia del catálogo). Solo cuenta en órdenes entregadas como
  // reparadas; las entregadas antes del catálogo tienen días pero no nombre.
  warrantyDays: number;
  warrantyName: string | null;
  technicianId: string | null;
  cancelReason: string;
  createdByName: string;
  updatedAt: Date;
  deliveredAt: Date | null;
  // null en órdenes registradas antes de existir el tipo de ingreso.
  intakeType: IntakeType | null;
  diagnosisFee: string | null;
  // Refacciones por conseguir anotadas al recibir (vacío si no aplica).
  partsToGet: OrderPartToGet[];
  // Parte del diagnóstico cobrado que se descuenta de la reparación (null si nada). Si es igual a
  // diagnosisFee, el diagnóstico se descontó completo y su renglón ya no está en la orden.
  diagnosisDiscount: string | null;
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
        warranty_name: string | null;
        technician_id: string | null;
        cancel_reason: string;
        created_by_name: string;
        updated_at: Date;
        delivered_at: Date | null;
        intake_type: IntakeType | null;
        diagnosis_fee: string | null;
      }
    >(
      `SELECT o.id, o.folio::int AS folio, o.status, o.device_type, o.brand, o.model, o.serial_number,
              o.technician_name, o.paid_total, o.promised_on::text AS promised_on, o.created_at,
              btrim(c.first_name || ' ' || c.last_name) AS customer_name, c.phone AS customer_phone,
              0 AS total, o.customer_id, c.email AS customer_email, o.outcome, o.color, o.unlock_type, o.unlock_code,
              o.accessories, o.device_condition, o.reported_issue, o.diagnosis, o.estimated_cost,
              o.warranty_days, o.warranty_name, o.technician_id, o.cancel_reason, o.created_by_name, o.updated_at, o.delivered_at,
              o.intake_type, o.diagnosis_fee
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
      is_diagnosis: boolean;
      user_name: string;
      created_at: Date;
    }>(
      `SELECT id, kind, item_id, description, quantity, unit_price, labor_price, tax_rate, tax_included, subtotal, tax_amount,
              total, is_diagnosis, user_name, created_at
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

    const { rows: partToGetRows } = await client.query<{
      id: string;
      item_id: string | null;
      description: string;
      quantity: number;
    }>(
      "SELECT id, item_id, description, quantity FROM repair_order_quoted_parts WHERE order_id = $1 ORDER BY created_at, id",
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
      isDiagnosis: line.is_diagnosis,
      userName: line.user_name,
      createdAt: line.created_at,
    }));
    const diagnosisFee = row.diagnosis_fee !== null && toCents(row.diagnosis_fee) > 0 ? row.diagnosis_fee : null;
    const diagnosisLine = lines.find((line) => line.isDiagnosis);
    // En órdenes canceladas se borran todos los renglones: ahí no hay descuento que mostrar.
    const discountCents =
      diagnosisFee !== null && row.status !== "cancelled"
        ? toCents(diagnosisFee) - (diagnosisLine ? toCents(diagnosisLine.total) : 0)
        : 0;

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
      warrantyName: row.warranty_name,
      technicianId: row.technician_id,
      cancelReason: row.cancel_reason,
      createdByName: row.created_by_name,
      updatedAt: row.updated_at,
      deliveredAt: row.delivered_at,
      intakeType: row.intake_type,
      diagnosisFee,
      partsToGet: partToGetRows.map((part) => ({
        id: part.id,
        itemId: part.item_id,
        description: part.description,
        quantity: part.quantity,
      })),
      diagnosisDiscount: discountCents > 0 ? fromCents(discountCents) : null,
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
    input.unlockType,
  ];
}

// El diagnóstico se cobra como mano de obra con IVA incluido.
const DIAGNOSIS_TAX_RATE = 16;

function diagnosisAmounts(cents: number) {
  return computeLine({ unitPriceCents: cents, quantity: 1, taxRate: DIAGNOSIS_TAX_RATE, taxIncluded: true });
}

async function insertDiagnosisLine(client: PoolClient, actor: CashActor, orderId: string, feeCents: number) {
  const amounts = diagnosisAmounts(feeCents);
  await client.query(
    `INSERT INTO repair_order_lines (order_id, kind, description, quantity, unit_price, tax_rate, tax_included,
                                     subtotal, tax_amount, total, is_diagnosis, user_id, user_name)
     VALUES ($1, 'labor', $2, 1, $3, $4, true, $5, $6, $7, true, $8, $9)`,
    [
      orderId,
      DIAGNOSIS_LINE_DESCRIPTION,
      fromCents(feeCents),
      DIAGNOSIS_TAX_RATE,
      fromCents(amounts.subtotal),
      fromCents(amounts.tax),
      fromCents(amounts.total),
      actor.userId,
      actor.userName,
    ],
  );
}

// Descuento del diagnóstico. El diagnóstico cobrado al recibir es un cobro mínimo: si el taller lo
// descuenta y la orden no se entrega sin reparación, el renglón del diagnóstico cobra solo lo que
// falte para llegar a su costo (nada si la reparación ya lo supera); si no, se cobra completo.
// Nunca genera saldo a favor. Se llama después de cada cambio en los renglones, en el resultado de
// la orden y al entregarla; el total siempre sale de los renglones.
async function syncDiagnosisLine(client: PoolClient, actor: CashActor, orderId: string) {
  const { rows } = await client.query<{
    diagnosis_fee: string | null;
    outcome: OrderOutcome | null;
    work_total: string;
    line_id: string | null;
    line_total: string | null;
  }>(
    `SELECT o.diagnosis_fee, o.outcome,
            COALESCE((SELECT sum(l.total) FROM repair_order_lines l WHERE l.order_id = o.id AND NOT l.is_diagnosis), 0)::text
              AS work_total,
            d.id AS line_id, d.total AS line_total
       FROM repair_orders o
       LEFT JOIN repair_order_lines d ON d.order_id = o.id AND d.is_diagnosis
      WHERE o.id = $1`,
    [orderId],
  );
  const row = rows[0];
  const feeCents = row?.diagnosis_fee ? toCents(row.diagnosis_fee) : 0;
  if (!row || feeCents <= 0) return;

  const { diagnosisCredit } = await readRepairSettings(client);
  const credited = diagnosisCredit && row.outcome !== "not_repaired";
  const desiredCents = credited ? Math.max(0, feeCents - toCents(row.work_total)) : feeCents;
  const currentCents = row.line_total !== null ? toCents(row.line_total) : 0;
  if (desiredCents === currentCents && (row.line_id !== null) === desiredCents > 0) return;

  if (desiredCents === 0) {
    await client.query("DELETE FROM repair_order_lines WHERE order_id = $1 AND is_diagnosis", [orderId]);
  } else if (row.line_id) {
    const amounts = diagnosisAmounts(desiredCents);
    await client.query(
      "UPDATE repair_order_lines SET unit_price = $1, subtotal = $2, tax_amount = $3, total = $4 WHERE id = $5",
      [fromCents(desiredCents), fromCents(amounts.subtotal), fromCents(amounts.tax), fromCents(amounts.total), row.line_id],
    );
  } else {
    await insertDiagnosisLine(client, actor, orderId, desiredCents);
  }

  // Solo se anota cuando pasa de cobrarse completo a descontarse (en parte o completo), o al revés.
  const wasFull = currentCents === feeCents;
  const isFull = desiredCents === feeCents;
  if (wasFull !== isFull) {
    await addEvent(
      client,
      actor,
      orderId,
      null,
      isFull ? "Se vuelve a cobrar el diagnóstico." : "El diagnóstico se descuenta de la reparación.",
    );
  }
}

// Aplica la configuración de órdenes recién guardada a las órdenes abiertas con diagnóstico cobrado,
// para que sus totales (y el saldo al entregar) reflejen el cambio. Corre en la misma transacción.
export async function syncOpenOrdersDiagnosis(client: PoolClient, actor: CashActor) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM repair_orders
      WHERE diagnosis_fee > 0 AND status NOT IN ('delivered', 'cancelled')
      ORDER BY id FOR UPDATE`,
  );
  for (const row of rows) await syncDiagnosisLine(client, actor, row.id);
}

// Revisa el cobro de la recepción según el tipo de ingreso. El anticipo obligatorio solo se
// exige a quien puede cobrar; sin ese permiso la orden se registra sin cobro.
function checkIntakePayment(intake: OrderIntake) {
  if (!intake.canCollect) {
    if (intake.payment) throw new OrderError("No tienes permiso para cobrar reparaciones.");
    return;
  }
  const hasPayment = (intake.payment?.payments.length ?? 0) > 0;
  switch (intake.type) {
    case "in_stock":
      if (!hasPayment) throw new OrderError("Registra el anticipo: la refacción está en existencia.");
      break;
    case "diagnosis":
      if (intake.diagnosisFeeCents > 0 && !hasPayment) throw new OrderError("Cobra el diagnóstico para registrar la orden.");
      if (intake.diagnosisFeeCents === 0 && hasPayment) throw new OrderError("El diagnóstico es gratis: no hay nada que cobrar.");
      break;
    case "order_part":
      break;
  }
}

// Refacciones de la recepción según el tipo de ingreso: en existencia se elige al menos una; por
// conseguir se anota al menos una pieza. Lo que no corresponde al tipo se ignora. Los artículos
// repetidos se juntan y se ordenan para bloquear los artículos siempre en el mismo orden.
function normalizeIntakeParts(intake: OrderIntake) {
  const parts = new Map<string, number>();
  let freePart: FreeLineInput | null = null;
  const partsToGet: PartToGetInput[] = [];

  if (intake.type === "in_stock") {
    if (intake.parts.length > 20) throw new OrderError("Son demasiadas refacciones.");
    for (const part of intake.parts) {
      assertIds(part.itemId);
      checkQuantity(part.quantity);
      parts.set(part.itemId, (parts.get(part.itemId) ?? 0) + part.quantity);
    }
    for (const quantity of parts.values()) checkQuantity(quantity);
    if (intake.freePart) {
      checkFreeLine("part", intake.freePart);
      freePart = intake.freePart;
    }
    if (parts.size === 0 && !freePart) throw new OrderError("Elige la refacción que se va a cambiar.");
  } else if (intake.type === "order_part") {
    if (intake.partsToGet.length > 20) throw new OrderError("Son demasiadas refacciones.");
    for (const part of intake.partsToGet) {
      checkQuantity(part.quantity);
      if (part.itemId !== null) {
        assertIds(part.itemId);
        const itemId = part.itemId.toLowerCase();
        const same = partsToGet.find((entry) => entry.itemId === itemId);
        if (same) {
          same.quantity += part.quantity;
          checkQuantity(same.quantity);
        } else {
          // El nombre lo pone el servidor con el artículo.
          partsToGet.push({ itemId, description: "", quantity: part.quantity });
        }
      } else {
        const description = part.description.trim().slice(0, 150);
        if (!description) throw new OrderError("Describe la refacción que hay que conseguir.");
        partsToGet.push({ itemId: null, description, quantity: part.quantity });
      }
    }
    if (partsToGet.length === 0) throw new OrderError("Anota la refacción que hay que conseguir.");
  }

  return {
    parts: [...parts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([itemId, quantity]) => ({ itemId, quantity })),
    freePart,
    partsToGet,
  };
}

// Anota las refacciones por conseguir de una orden nueva. De los artículos del inventario se
// guarda su nombre actual; pueden estar agotados. No mueven existencias ni generan cobro.
async function insertPartsToGet(client: PoolClient, orderId: string, partsToGet: PartToGetInput[]) {
  const itemIds = partsToGet.flatMap((part) => (part.itemId ? [part.itemId] : []));
  const names = new Map<string, string>();
  if (itemIds.length > 0) {
    const { rows } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM items
        WHERE id = ANY($1::uuid[]) AND is_active AND (is_repair_part OR is_for_sale)`,
      [itemIds],
    );
    for (const row of rows) names.set(row.id, row.name);
  }

  for (const part of partsToGet) {
    let description = part.description;
    if (part.itemId) {
      const name = names.get(part.itemId);
      if (!name) throw new OrderError("Uno de los artículos ya no está disponible.");
      description = name.slice(0, 150);
    }
    await client.query(
      "INSERT INTO repair_order_quoted_parts (order_id, item_id, description, quantity) VALUES ($1, $2, $3, $4)",
      [orderId, part.itemId, description, part.quantity],
    );
  }
}

export async function createOrder(
  tenantId: string,
  actor: CashActor,
  input: OrderInput,
  intake: OrderIntake,
  // Enlaces de fotos generados durante la recepción: sus fotos quedan ligadas a la orden.
  options: { photoSessionIds: string[]; cash: CashOptions },
) {
  const payments = intake.payment?.payments ?? [];
  assertIds(input.customerId, ...options.photoSessionIds, ...payments.map((payment) => payment.bankAccountId));
  if (!Number.isInteger(intake.diagnosisFeeCents) || intake.diagnosisFeeCents < 0) {
    throw new OrderError("Costo del diagnóstico no válido.");
  }
  const diagnosisFeeCents = intake.type === "diagnosis" ? intake.diagnosisFeeCents : 0;
  const { parts, freePart, partsToGet } = normalizeIntakeParts(intake);
  checkIntakePayment({ ...intake, diagnosisFeeCents });

  // Todo en una transacción: si el cobro falla, la orden no se registra.
  return withTenantDb(tenantId, async (client) => {
    let shiftId: string | null = null;
    if (payments.length > 0) {
      shiftId = await findShiftId(client, options.cash);
      assertShift(shiftId, options.cash, "Abre la caja para cobrar al recibir el equipo.");
    }

    await assertCustomer(client, input.customerId);
    const { rows } = await client.query<{ id: string; folio: number }>(
      `INSERT INTO repair_orders (customer_id, device_type, brand, model, serial_number, color, unlock_code,
                                  accessories, device_condition, reported_issue, estimated_cost, promised_on,
                                  unlock_type, created_by, created_by_name, intake_type, diagnosis_fee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, folio::int AS folio`,
      [
        ...orderValues(input),
        actor.userId,
        actor.userName,
        intake.type,
        diagnosisFeeCents > 0 ? fromCents(diagnosisFeeCents) : null,
      ],
    );
    const order = rows[0];
    await addEvent(client, actor, order.id, "received", INTAKE_TYPE_LABELS[intake.type]);
    if (partsToGet.length > 0) await insertPartsToGet(client, order.id, partsToGet);

    if (diagnosisFeeCents > 0) await insertDiagnosisLine(client, actor, order.id, diagnosisFeeCents);
    // La refacción en existencia se aparta desde la recepción: se descuenta del inventario igual
    // que cuando la agrega el técnico, y regresa si la orden se cancela.
    for (const part of parts) await insertInventoryPart(client, actor, order, part);
    if (freePart) await insertFreeLine(client, actor, order.id, "part", freePart);

    if (payments.length > 0) {
      const amount = sumCents(payments.map((payment) => payment.amountCents));
      const cash = await validatePayments(client, payments, {
        // El diagnóstico se cobra completo; el anticipo, lo que se capture.
        totalCents: diagnosisFeeCents > 0 ? diagnosisFeeCents : amount,
        cashReceivedCents: intake.payment?.cashReceivedCents ?? null,
      });
      await insertPayments(client, actor, order.id, shiftId, "deposit", payments, cash);
      await client.query("UPDATE repair_orders SET paid_total = $1 WHERE id = $2", [fromCents(amount), order.id]);
    }

    await syncDiagnosisLine(client, actor, order.id);
    for (const sessionId of options.photoSessionIds) {
      await attachUploadSession(client, sessionId, order.id);
    }
    return order;
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
              estimated_cost = $11, promised_on = $12, unlock_type = $13
        WHERE id = $14`,
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
    // Sin reparación el diagnóstico se cobra completo; al volver a reparación se descuenta otra vez.
    await syncDiagnosisLine(client, actor, orderId);
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
  checkQuantity(input.quantity);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    assertAssigned(order, actor, options);
    await insertInventoryPart(client, actor, order, input);
    await syncDiagnosisLine(client, actor, orderId);
  });
}

function checkQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new OrderError("Cantidad no válida.");
}

// Agrega un artículo del inventario como renglón: el precio sale del artículo (nunca del navegador)
// y se descuenta de las existencias. La orden ya está bloqueada y revisada por quien llama.
async function insertInventoryPart(
  client: PoolClient,
  actor: CashActor,
  order: { id: string; folio: number },
  input: IntakePart,
) {
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
      order.id,
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
}

export type FreeLineInput = {
  description: string;
  quantity: number;
  priceCents: number;
  taxRate: number;
  taxIncluded: boolean;
};

// Renglón capturado a mano: mano de obra, o una refacción sin artículo del inventario
// (talleres sin el módulo de Inventario). No toca existencias.
export async function addFreeLine(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  kind: "part" | "labor",
  input: FreeLineInput,
  options: WorkOptions = NO_OVERRIDE,
) {
  assertIds(orderId);
  checkFreeLine(kind, input);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    assertAssigned(order, actor, options);
    await insertFreeLine(client, actor, orderId, kind, input);
    await syncDiagnosisLine(client, actor, orderId);
  });
}

function checkFreeLine(kind: "part" | "labor", input: FreeLineInput) {
  if (!input.description) throw new OrderError(kind === "part" ? "Describe la refacción." : "Describe el trabajo.");
  checkQuantity(input.quantity);
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new OrderError("Precio no válido.");
  if (!(input.taxRate >= 0 && input.taxRate <= 100)) throw new OrderError("IVA no válido.");
}

async function insertFreeLine(
  client: PoolClient,
  actor: CashActor,
  orderId: string,
  kind: "part" | "labor",
  input: FreeLineInput,
) {
  const amounts = computeLine({
    unitPriceCents: input.priceCents,
    quantity: input.quantity,
    taxRate: input.taxRate,
    taxIncluded: input.taxIncluded,
  });
  await client.query(
    `INSERT INTO repair_order_lines (order_id, kind, description, quantity, unit_price, tax_rate, tax_included,
                                     subtotal, tax_amount, total, user_id, user_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      orderId,
      kind,
      input.description,
      input.quantity,
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
}

type LineRow = {
  kind: "part" | "labor";
  item_id: string | null;
  description: string;
  track_stock: boolean;
  quantity: number;
  is_diagnosis: boolean;
};

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
  // `allowIntakeFix`: quien recibe equipos puede quitar una refacción elegida por error al
  // recibir, mientras la orden siga recibida y sin técnico.
  options: WorkOptions & { allowLabor: boolean; allowIntakeFix: boolean } = {
    ...NO_OVERRIDE,
    allowLabor: false,
    allowIntakeFix: false,
  },
) {
  assertIds(orderId, lineId);

  await withTenantDb(tenantId, async (client) => {
    const order = await lockOrder(client, orderId);
    assertActive(order);
    const { rows } = await client.query<LineRow>(
      `SELECT kind, item_id, description, track_stock, quantity, is_diagnosis
         FROM repair_order_lines WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [lineId, orderId],
    );
    const line = rows[0];
    if (!line) throw new OrderError("El renglón ya no existe.");
    if (line.is_diagnosis) {
      throw new OrderError("El diagnóstico cobrado al recibir el equipo no se puede quitar.");
    }

    // Las refacciones las quita el técnico de la orden; la mano de obra, quien maneja los cobros.
    if (line.kind === "labor") {
      if (!options.allowLabor) throw new OrderError("La mano de obra solo la quita quien maneja los cobros.");
    } else if (!(options.allowIntakeFix && order.status === "received" && order.technician_id === null)) {
      assertAssigned(order, actor, options);
    }

    await returnPartToStock(client, actor, line, `Se quitó de la orden #${order.folio}`);
    await client.query("DELETE FROM repair_order_lines WHERE id = $1", [lineId]);
    await syncDiagnosisLine(client, actor, orderId);
  });
}

// `useCashShift`: con el módulo de Caja el dinero entra al turno abierto (y sin turno no se cobra);
// sin él, los cobros y reembolsos se registran sin turno ni revisión del efectivo en caja.
export type CashOptions = { useCashShift: boolean };

async function findShiftId(client: PoolClient, options: CashOptions) {
  return options.useCashShift ? findOpenShiftId(client, true) : null;
}

function assertShift(shiftId: string | null, options: CashOptions, message: string) {
  if (options.useCashShift && !shiftId) throw new OrderError(message);
}

async function insertPayments(
  client: PoolClient,
  actor: CashActor,
  orderId: string,
  shiftId: string | null,
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

// Anticipo o abono antes de entregar. Con Caja, entra al turno abierto.
export async function addOrderPayment(
  tenantId: string,
  actor: CashActor,
  orderId: string,
  input: { payments: PaymentInput[]; cashReceivedCents: number | null },
  options: CashOptions,
) {
  assertIds(orderId, ...input.payments.map((payment) => payment.bankAccountId));
  if (input.payments.length === 0) throw new OrderError("Agrega al menos un pago.");

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findShiftId(client, options);
    assertShift(shiftId, options, "Abre la caja para registrar cobros.");
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
  input: {
    payments: PaymentInput[];
    cashReceivedCents: number | null;
    refundMethod: PaymentMethod | null;
    // Total que vio quien entrega; si ya no coincide, se rechaza para no cobrar o reembolsar de más.
    expectedTotalCents: number | null;
    // Garantía del catálogo; solo se usa si el equipo quedó reparado.
    warrantyId: string | null;
  },
  options: CashOptions,
) {
  assertIds(orderId, ...input.payments.map((payment) => payment.bankAccountId));

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findShiftId(client, options);
    const order = await lockOrder(client, orderId);
    assertActive(order);
    if (order.status !== "ready") throw new OrderError("Marca la orden como lista para entregar antes de entregarla.");

    // La garantía se elige del catálogo activo y se guarda una copia. Sin reparación no hay garantía;
    // con el catálogo vacío el equipo reparado se entrega sin garantía.
    const { rows: outcomeRows } = await client.query<{ outcome: OrderOutcome | null }>(
      "SELECT outcome FROM repair_orders WHERE id = $1",
      [orderId],
    );
    let warranty: WarrantyInput = { name: "", days: 0 };
    if (outcomeRows[0]?.outcome === "repaired") {
      if (input.warrantyId) {
        const found = await findActiveWarranty(client, input.warrantyId);
        if (!found) throw new OrderError("La garantía elegida ya no está disponible. Elige otra.");
        warranty = found;
      } else if (await hasActiveWarranties(client)) {
        throw new OrderError("Elige la garantía del equipo.");
      }
    }
    // Normalmente no cambia nada (los renglones, el resultado y la configuración ya sincronizan);
    // asegura que se cobre con la regla vigente del diagnóstico.
    await syncDiagnosisLine(client, actor, orderId);

    const total = await loadTotalCents(client, orderId);
    if (input.expectedTotalCents !== null && input.expectedTotalCents !== total) {
      throw new OrderError(
        `El total de la orden cambió a ${formatMoney(fromCents(total))}. Recarga la página para ver el saldo actualizado.`,
      );
    }
    const balance = total - toCents(order.paid_total);
    let change = 0;

    if (balance > 0) {
      assertShift(shiftId, options, "Abre la caja para cobrar el saldo.");
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
      assertShift(shiftId, options, "Abre la caja para registrar el reembolso.");
      if (shiftId && input.refundMethod === "cash") await assertCashAvailable(client, shiftId, refund, "para reembolsar");
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
      `UPDATE repair_orders
          SET status = 'delivered', delivered_at = now(), paid_total = $1, warranty_days = $2, warranty_name = $3
        WHERE id = $4`,
      [fromCents(total), warranty.days, warranty.name || null, orderId],
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
  options: CashOptions,
) {
  assertIds(orderId);
  if (!input.reason) throw new OrderError("Escribe el motivo de la cancelación.");

  await withTenantDb(tenantId, async (client) => {
    const shiftId = await findShiftId(client, options);
    const order = await lockOrder(client, orderId);
    assertActive(order);

    const paid = toCents(order.paid_total);
    if (paid > 0) {
      if (!input.refundMethod) {
        throw new OrderError(`Elige cómo se reembolsan los ${formatMoney(order.paid_total)} pagados.`);
      }
      assertShift(shiftId, options, "Abre la caja para registrar el reembolso.");
      if (shiftId && input.refundMethod === "cash") await assertCashAvailable(client, shiftId, paid, "para reembolsar");
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
      `SELECT kind, item_id, description, track_stock, quantity, is_diagnosis
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
