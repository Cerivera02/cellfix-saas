import "server-only";
import type { PoolClient } from "pg";
import { assertCashAvailable, findOpenShiftId, type CashActor } from "@/lib/cash/core";
import type { PaymentMethod } from "@/lib/cash/labels";
import { fromCents, toCents } from "@/lib/cash/money";
import { isValidDay } from "@/lib/dates";
import { applyStockMovement } from "@/lib/inventory/core";
import { formatMoney } from "@/lib/inventory/format";
import type { PurchaseTerms } from "@/lib/purchases/labels";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Compras a proveedores: entrada de mercancía al inventario con su costo, de contado o a
// crédito, y los abonos al saldo. Todo corre en el schema del taller. No verifica la
// sesión: la acción o página que llama ya comprobó los permisos.

export type SupplierPaymentInput = {
  method: PaymentMethod;
  amountCents: number;
  bankAccountId: string | null;
  reference: string;
  // Efectivo tomado de la caja abierta (genera una salida en el corte).
  fromDrawer: boolean;
};

export type PurchaseLineInput = {
  itemId: string;
  quantity: number;
  unitCostCents: number;
  repairOrderId: string | null;
};

export type PurchaseInput = {
  supplierId: string;
  invoiceNumber: string;
  purchasedOn: string;
  terms: PurchaseTerms;
  dueOn: string | null;
  notes: string;
  lines: PurchaseLineInput[];
  payments: SupplierPaymentInput[];
};

export type PurchaseView = "all" | "payable";

export type PurchaseSummary = {
  id: string;
  folio: number;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  purchasedOn: string;
  terms: PurchaseTerms;
  dueOn: string | null;
  isOverdue: boolean;
  total: string;
  paidTotal: string;
  itemCount: number;
  createdAt: Date;
};

export type SupplierDebt = {
  supplierId: string;
  supplierName: string;
  balance: string;
  purchasesCount: number;
  nextDueOn: string | null;
  hasOverdue: boolean;
};

export type PurchaseDetail = PurchaseSummary & {
  notes: string;
  userName: string;
  lines: {
    id: string;
    itemId: string | null;
    itemName: string;
    quantity: number;
    unitCost: string;
    total: string;
    orderId: string | null;
    orderFolio: number | null;
  }[];
  payments: {
    id: string;
    method: PaymentMethod;
    amount: string;
    fromDrawer: boolean;
    bankName: string | null;
    reference: string;
    userName: string;
    createdAt: Date;
  }[];
};

export type PurchasableItem = { id: string; name: string; barcode: string | null; stock: number; purchasePrice: string };

// Error con un mensaje apto para mostrarse en la interfaz.
export class PurchaseError extends Error {}

function assertIds(...ids: (string | null)[]) {
  if (ids.some((id) => id !== null && !UUID_PATTERN.test(id))) throw new PurchaseError("Solicitud no válida.");
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Pagos a proveedores
// ---------------------------------------------------------------------------

async function checkSupplierPayments(client: PoolClient, payments: SupplierPaymentInput[]) {
  if (payments.length > 10) throw new PurchaseError("Registra como máximo 10 pagos a la vez.");
  for (const payment of payments) {
    if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
      throw new PurchaseError("Cada pago debe ser mayor a 0.");
    }
    if (payment.fromDrawer && payment.method !== "cash") throw new PurchaseError("Solo el efectivo puede salir de la caja.");
  }

  const accounts = [
    ...new Set(
      payments
        .map((payment) => (payment.method === "transfer" ? payment.bankAccountId : null))
        .filter((accountId): accountId is string => Boolean(accountId)),
    ),
  ];
  if (accounts.length > 0) {
    const { rows } = await client.query("SELECT id FROM bank_accounts WHERE id = ANY($1::uuid[]) AND is_active", [accounts]);
    if (rows.length !== accounts.length) throw new PurchaseError("La cuenta bancaria elegida ya no está disponible.");
  }

  return {
    totalCents: sumCents(payments.map((payment) => payment.amountCents)),
    drawerCents: sumCents(payments.filter((payment) => payment.fromDrawer).map((payment) => payment.amountCents)),
  };
}

// Si algún pago sale de la caja, bloquea el turno abierto (igual que ventas y retiros).
async function lockDrawer(client: PoolClient, payments: SupplierPaymentInput[]) {
  if (!payments.some((payment) => payment.fromDrawer)) return null;
  const shiftId = await findOpenShiftId(client, true);
  if (!shiftId) throw new PurchaseError("No hay una caja abierta para tomar el efectivo.");
  return shiftId;
}

async function insertSupplierPayments(
  client: PoolClient,
  actor: CashActor,
  purchaseId: string,
  shiftId: string | null,
  payments: SupplierPaymentInput[],
) {
  for (const payment of payments) {
    await client.query(
      `INSERT INTO purchase_payments (purchase_id, method, amount, shift_id, bank_account_id, reference, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        purchaseId,
        payment.method,
        fromCents(payment.amountCents),
        payment.fromDrawer ? shiftId : null,
        payment.method === "transfer" ? payment.bankAccountId : null,
        payment.reference,
        actor.userId,
        actor.userName,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export async function createPurchase(tenantId: string, actor: CashActor, input: PurchaseInput) {
  assertIds(
    input.supplierId,
    ...input.lines.flatMap((line) => [line.itemId, line.repairOrderId]),
    ...input.payments.map((payment) => payment.bankAccountId),
  );

  if (input.lines.length === 0) throw new PurchaseError("Agrega al menos un artículo.");
  if (input.lines.length > 200) throw new PurchaseError("Registra como máximo 200 renglones por compra.");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100_000) {
      throw new PurchaseError("Cantidad no válida.");
    }
    if (!Number.isInteger(line.unitCostCents) || line.unitCostCents < 0 || line.unitCostCents > 10_000_000_00) {
      throw new PurchaseError("Costo no válido.");
    }
  }
  if (!isValidDay(input.purchasedOn)) throw new PurchaseError("Fecha de compra no válida.");
  if (input.dueOn !== null && (input.terms !== "credit" || !isValidDay(input.dueOn))) {
    throw new PurchaseError("Fecha de vencimiento no válida.");
  }

  const total = sumCents(input.lines.map((line) => line.quantity * line.unitCostCents));
  if (total <= 0) throw new PurchaseError("El total de la compra debe ser mayor a 0.");

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await lockDrawer(client, input.payments);

    const { rows: supplierRows } = await client.query<{ is_active: boolean }>(
      "SELECT is_active FROM suppliers WHERE id = $1",
      [input.supplierId],
    );
    if (!supplierRows[0]?.is_active) throw new PurchaseError("Elige un proveedor activo.");

    // Bloquea los artículos (en orden fijo para evitar interbloqueos).
    const itemIds = [...new Set(input.lines.map((line) => line.itemId.toLowerCase()))];
    const { rows: itemRows } = await client.query<{ id: string; name: string; is_active: boolean; track_stock: boolean }>(
      "SELECT id, name, is_active, track_stock FROM items WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [itemIds],
    );
    const itemsById = new Map(itemRows.map((item) => [item.id, item]));
    for (const itemId of itemIds) {
      const item = itemsById.get(itemId);
      if (!item || !item.is_active) throw new PurchaseError("Uno de los artículos ya no está disponible.");
      if (!item.track_stock) {
        throw new PurchaseError(`${item.name} no controla existencias; actívalo en el artículo para registrar compras.`);
      }
    }

    const orderIds = [
      ...new Set(input.lines.map((line) => line.repairOrderId?.toLowerCase()).filter((id): id is string => Boolean(id))),
    ];
    const ordersById = new Map<string, number>();
    if (orderIds.length > 0) {
      const { rows } = await client.query<{ id: string; folio: number; status: string }>(
        "SELECT id, folio::int AS folio, status FROM repair_orders WHERE id = ANY($1::uuid[])",
        [orderIds],
      );
      for (const orderId of orderIds) {
        const order = rows.find((row) => row.id === orderId);
        if (!order) throw new PurchaseError("Una de las órdenes ligadas ya no existe.");
        if (order.status === "delivered" || order.status === "cancelled") {
          throw new PurchaseError(`La orden #${order.folio} ya está cerrada; no se le pueden ligar compras.`);
        }
        ordersById.set(orderId, order.folio);
      }
    }

    const { totalCents: paid, drawerCents } = await checkSupplierPayments(client, input.payments);
    if (input.terms === "cash" && paid !== total) {
      throw new PurchaseError(
        `De contado se paga completa: los pagos suman ${formatMoney(fromCents(paid))} y el total es ${formatMoney(fromCents(total))}.`,
      );
    }
    if (input.terms === "credit" && paid > total) throw new PurchaseError("Los abonos superan el total de la compra.");
    if (shiftId) await assertCashAvailable(client, shiftId, drawerCents, "para pagar al proveedor");

    const { rows: purchaseRows } = await client.query<{ id: string; folio: number }>(
      `INSERT INTO purchases (supplier_id, invoice_number, purchased_on, terms, due_on, total, paid_total, notes,
                              user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, folio::int AS folio`,
      [
        input.supplierId,
        input.invoiceNumber,
        input.purchasedOn,
        input.terms,
        input.dueOn,
        fromCents(total),
        fromCents(paid),
        input.notes,
        actor.userId,
        actor.userName,
      ],
    );
    const purchase = purchaseRows[0];

    const lastCost = new Map<string, number>();
    for (const line of input.lines) {
      const itemId = line.itemId.toLowerCase();
      const orderId = line.repairOrderId?.toLowerCase() ?? null;
      const item = itemsById.get(itemId);
      if (!item) continue;

      await client.query(
        `INSERT INTO purchase_items (purchase_id, item_id, item_name, quantity, unit_cost, total, repair_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          purchase.id,
          itemId,
          item.name,
          line.quantity,
          fromCents(line.unitCostCents),
          fromCents(line.quantity * line.unitCostCents),
          orderId,
        ],
      );
      await applyStockMovement(client, actor, itemId, {
        kind: "purchase",
        quantity: line.quantity,
        unitCost: fromCents(line.unitCostCents),
        supplierId: input.supplierId,
        note: orderId ? `Compra #${purchase.folio} · Orden #${ordersById.get(orderId)}` : `Compra #${purchase.folio}`,
      });
      lastCost.set(itemId, line.unitCostCents);
    }

    // El precio de compra del artículo queda con el último costo pagado.
    for (const [itemId, cost] of lastCost) {
      await client.query("UPDATE items SET purchase_price = $1 WHERE id = $2", [fromCents(cost), itemId]);
    }

    await insertSupplierPayments(client, actor, purchase.id, shiftId, input.payments);

    return purchase;
  });
}

export async function addPurchasePayment(
  tenantId: string,
  actor: CashActor,
  purchaseId: string,
  payments: SupplierPaymentInput[],
) {
  assertIds(purchaseId, ...payments.map((payment) => payment.bankAccountId));
  if (payments.length === 0) throw new PurchaseError("Agrega al menos un pago.");

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await lockDrawer(client, payments);

    const { rows } = await client.query<{ total: string; paid_total: string }>(
      "SELECT total, paid_total FROM purchases WHERE id = $1 FOR UPDATE",
      [purchaseId],
    );
    const purchase = rows[0];
    if (!purchase) throw new PurchaseError("La compra ya no existe.");

    const balance = toCents(purchase.total) - toCents(purchase.paid_total);
    if (balance <= 0) throw new PurchaseError("La compra ya está pagada.");

    const { totalCents, drawerCents } = await checkSupplierPayments(client, payments);
    if (totalCents > balance) {
      throw new PurchaseError(`El abono excede el saldo pendiente (${formatMoney(fromCents(balance))}).`);
    }
    if (shiftId) await assertCashAvailable(client, shiftId, drawerCents, "para pagar al proveedor");

    await insertSupplierPayments(client, actor, purchaseId, shiftId, payments);
    await client.query("UPDATE purchases SET paid_total = paid_total + $1 WHERE id = $2", [
      fromCents(totalCents),
      purchaseId,
    ]);

    return { balance: fromCents(balance - totalCents) };
  });
}

type SummaryRow = {
  id: string;
  folio: number;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  purchased_on: string;
  terms: PurchaseTerms;
  due_on: string | null;
  is_overdue: boolean;
  total: string;
  paid_total: string;
  item_count: number;
  created_at: Date;
};

const SUMMARY_SELECT = `
  SELECT p.id, p.folio::int AS folio, p.supplier_id, s.name AS supplier_name, p.invoice_number,
         p.purchased_on::text AS purchased_on, p.terms, p.due_on::text AS due_on,
         COALESCE(p.paid_total < p.total AND p.due_on < current_date, false) AS is_overdue,
         p.total, p.paid_total, p.created_at,
         (SELECT COALESCE(sum(quantity), 0)::int FROM purchase_items WHERE purchase_id = p.id) AS item_count
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id`;

function mapSummary(row: SummaryRow): PurchaseSummary {
  return {
    id: row.id,
    folio: row.folio,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    invoiceNumber: row.invoice_number,
    purchasedOn: row.purchased_on,
    terms: row.terms,
    dueOn: row.due_on,
    isOverdue: row.is_overdue,
    total: row.total,
    paidTotal: row.paid_total,
    itemCount: row.item_count,
    createdAt: row.created_at,
  };
}

export async function listPurchases(
  tenantId: string,
  options: { view: PurchaseView; search: string },
): Promise<{ purchases: PurchaseSummary[]; debts: SupplierDebt[]; counts: Record<PurchaseView, number> }> {
  return withTenantDb(tenantId, async (client) => {
    const params: string[] = [];
    const conditions: string[] = [];
    if (options.view === "payable") conditions.push("p.paid_total < p.total");

    const search = options.search.trim().slice(0, 100);
    if (search) {
      params.push(search.replace(/^#/, ""), `%${escapeLike(search)}%`);
      conditions.push("(p.folio::text = $1 OR p.invoice_number ILIKE $2 OR s.name ILIKE $2)");
    }

    const { rows } = await client.query<SummaryRow>(
      `${SUMMARY_SELECT}
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY ${options.view === "payable" ? "p.due_on NULLS LAST, p.created_at" : "p.created_at DESC"}
        LIMIT 200`,
      params,
    );

    const { rows: debtRows } = await client.query<{
      supplier_id: string;
      supplier_name: string;
      balance: string;
      purchases_count: number;
      next_due_on: string | null;
      has_overdue: boolean;
    }>(
      `SELECT s.id AS supplier_id, s.name AS supplier_name, sum(p.total - p.paid_total) AS balance,
              count(*)::int AS purchases_count, min(p.due_on)::text AS next_due_on,
              COALESCE(bool_or(p.due_on < current_date), false) AS has_overdue
         FROM purchases p
         JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.paid_total < p.total
        GROUP BY s.id, s.name
        ORDER BY sum(p.total - p.paid_total) DESC`,
    );

    const { rows: countRows } = await client.query<{ all_count: number; payable_count: number }>(
      `SELECT count(*)::int AS all_count, count(*) FILTER (WHERE paid_total < total)::int AS payable_count
         FROM purchases`,
    );

    return {
      purchases: rows.map(mapSummary),
      debts: debtRows.map((row) => ({
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        balance: row.balance,
        purchasesCount: row.purchases_count,
        nextDueOn: row.next_due_on,
        hasOverdue: row.has_overdue,
      })),
      counts: { all: countRows[0].all_count, payable: countRows[0].payable_count },
    };
  });
}

export async function getPurchase(tenantId: string, purchaseId: string): Promise<PurchaseDetail | null> {
  if (!UUID_PATTERN.test(purchaseId)) return null;

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<SummaryRow & { notes: string; user_name: string }>(
      `${SUMMARY_SELECT.replace("p.created_at,", "p.created_at, p.notes, p.user_name,")} WHERE p.id = $1`,
      [purchaseId],
    );
    const row = rows[0];
    if (!row) return null;

    const { rows: lineRows } = await client.query<{
      id: string;
      item_id: string | null;
      item_name: string;
      quantity: number;
      unit_cost: string;
      total: string;
      repair_order_id: string | null;
      order_folio: number | null;
    }>(
      `SELECT pi.id, pi.item_id, pi.item_name, pi.quantity, pi.unit_cost, pi.total, pi.repair_order_id,
              o.folio::int AS order_folio
         FROM purchase_items pi
         LEFT JOIN repair_orders o ON o.id = pi.repair_order_id
        WHERE pi.purchase_id = $1
        ORDER BY pi.item_name`,
      [purchaseId],
    );

    const { rows: paymentRows } = await client.query<{
      id: string;
      method: PaymentMethod;
      amount: string;
      from_drawer: boolean;
      bank_name: string | null;
      reference: string;
      user_name: string;
      created_at: Date;
    }>(
      `SELECT pp.id, pp.method, pp.amount, pp.shift_id IS NOT NULL AS from_drawer, b.bank_name, pp.reference,
              pp.user_name, pp.created_at
         FROM purchase_payments pp
         LEFT JOIN bank_accounts b ON b.id = pp.bank_account_id
        WHERE pp.purchase_id = $1
        ORDER BY pp.created_at`,
      [purchaseId],
    );

    return {
      ...mapSummary(row),
      notes: row.notes,
      userName: row.user_name,
      lines: lineRows.map((line) => ({
        id: line.id,
        itemId: line.item_id,
        itemName: line.item_name,
        quantity: line.quantity,
        unitCost: line.unit_cost,
        total: line.total,
        orderId: line.repair_order_id,
        orderFolio: line.order_folio,
      })),
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: payment.amount,
        fromDrawer: payment.from_drawer,
        bankName: payment.bank_name,
        reference: payment.reference,
        userName: payment.user_name,
        createdAt: payment.created_at,
      })),
    };
  });
}

// Artículos que se pueden comprar: activos y con control de existencias.
export async function searchPurchasableItems(tenantId: string, query: string): Promise<PurchasableItem[]> {
  const search = query.trim().slice(0, 100);

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      name: string;
      barcode: string | null;
      stock: number;
      purchase_price: string;
    }>(
      `SELECT id, name, barcode, stock, purchase_price
         FROM items
        WHERE is_active AND track_stock AND (name ILIKE $1 OR barcode = $2)
        ORDER BY (barcode = $2) DESC NULLS LAST, lower(name)
        LIMIT 20`,
      [`%${escapeLike(search)}%`, search],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      barcode: row.barcode,
      stock: row.stock,
      purchasePrice: row.purchase_price,
    }));
  });
}
