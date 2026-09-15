import "server-only";
import type { PoolClient } from "pg";
import { isUniqueViolation } from "@/lib/db";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/cash/labels";
import { computeLine, fromCents, refundForLine, toCents } from "@/lib/cash/money";
import { applyStockMovement } from "@/lib/inventory/core";
import { formatMoney } from "@/lib/inventory/format";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Caja del taller: turnos, ventas, pagos, devoluciones y cuentas bancarias.
// Todo corre en el schema del taller. No verifica la sesión: la acción o página que
// llama ya comprobó los permisos. Los precios siempre se leen de la base de datos,
// nunca del cliente.

export type CashActor = { userId: string; userName: string };

export type BankAccountInput = { bankName: string; holderName: string; clabe: string; alias: string };

export type BankAccount = BankAccountInput & { id: string; isActive: boolean };

export type SellableItem = {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: string;
  taxRate: string;
  taxIncluded: boolean;
  trackStock: boolean;
  stock: number;
};

export type ShiftSummary = {
  id: string;
  openedAt: Date;
  openedByName: string;
  openingAmount: string;
  closedAt: Date | null;
  closedByName: string | null;
  expectedAmount: string | null;
  countedAmount: string | null;
  closingNotes: string;
  salesCount: number;
  salesTotal: string;
  // Anticipos y pagos de órdenes de reparación cobrados en el turno.
  ordersCount: number;
  ordersCollected: string;
  // Devoluciones de ventas y reembolsos de órdenes.
  refundsTotal: string;
  paymentsByMethod: Record<PaymentMethod, string>;
  cashIn: string;
  cashOut: string;
  cashRefunds: string;
  // Pagos a proveedores con efectivo de la caja.
  supplierPayments: string;
  // Efectivo que debería haber en caja: al cierre se congela en expectedAmount.
  expectedCash: string;
};

export type CashMovement = {
  id: string;
  kind: "in" | "out";
  amount: string;
  reason: string;
  userName: string;
  createdAt: Date;
};

export type ShiftOrderPayment = {
  id: string;
  orderId: string;
  folio: number;
  customerName: string;
  kind: "deposit" | "payment" | "refund";
  method: PaymentMethod;
  amount: string;
  userName: string;
  createdAt: Date;
};

export type SaleSummary = {
  id: string;
  folio: number;
  createdAt: Date;
  customerName: string;
  total: string;
  refundedTotal: string;
  userName: string;
  itemCount: number;
};

export type SaleDetail = {
  id: string;
  folio: number;
  shiftId: string;
  createdAt: Date;
  customerName: string;
  customerId: string | null;
  customerPhone: string;
  customerEmail: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  cashReceived: string | null;
  changeAmount: string;
  refundedTotal: string;
  userName: string;
  items: {
    id: string;
    itemId: string | null;
    itemName: string;
    barcode: string | null;
    quantity: number;
    returnedQuantity: number;
    unitPrice: string;
    taxRate: string;
    taxIncluded: boolean;
    subtotal: string;
    taxAmount: string;
    total: string;
    refundedAmount: string;
  }[];
  payments: {
    id: string;
    method: PaymentMethod;
    amount: string;
    reference: string;
    bankName: string | null;
    holderName: string | null;
    clabe: string | null;
  }[];
  returns: {
    id: string;
    createdAt: Date;
    refundMethod: PaymentMethod;
    refundTotal: string;
    reason: string;
    restocked: boolean;
    userName: string;
    items: { itemName: string; quantity: number; amount: string }[];
  }[];
};

export type PaymentInput = {
  method: PaymentMethod;
  amountCents: number;
  bankAccountId: string | null;
  reference: string;
};

export type SaleInput = {
  customerId: string;
  lines: { itemId: string; quantity: number }[];
  payments: PaymentInput[];
  // Efectivo que entregó el cliente (para calcular el cambio). null si no pagó en efectivo.
  cashReceivedCents: number | null;
};

export type ReturnInput = {
  lines: { saleItemId: string; quantity: number }[];
  refundMethod: PaymentMethod;
  reason: string;
  restock: boolean;
};

// Error con un mensaje apto para mostrarse en la interfaz.
export class CashError extends Error {}

function assertIds(...ids: (string | null)[]) {
  if (ids.some((id) => id !== null && !UUID_PATTERN.test(id))) throw new CashError("Solicitud no válida.");
}

function sumCents(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

// ---------------------------------------------------------------------------
// Turnos de caja
// ---------------------------------------------------------------------------

// Con `lock` bloquea el turno: ventas, devoluciones, movimientos y cierre se serializan.
export async function findOpenShiftId(client: PoolClient, lock = false) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM cash_shifts WHERE closed_at IS NULL${lock ? " FOR UPDATE" : ""}`,
  );
  return rows[0]?.id ?? null;
}

export async function loadShiftSummary(client: PoolClient, shiftId: string): Promise<ShiftSummary | null> {
  const { rows } = await client.query<{
    id: string;
    opened_at: Date;
    opened_by_name: string;
    opening_amount: string;
    closed_at: Date | null;
    closed_by_name: string | null;
    expected_amount: string | null;
    counted_amount: string | null;
    closing_notes: string;
    sales_count: number;
    sales_total: string;
    refunds_total: string;
    cash_in: string;
    cash_out: string;
    cash_refunds: string;
    orders_count: number;
    orders_collected: string;
    supplier_payments: string;
  }>(
    `SELECT s.id, s.opened_at, s.opened_by_name, s.opening_amount, s.closed_at, s.closed_by_name,
            s.expected_amount, s.counted_amount, s.closing_notes,
            (SELECT count(*)::int FROM sales WHERE shift_id = s.id) AS sales_count,
            COALESCE((SELECT sum(total) FROM sales WHERE shift_id = s.id), 0) AS sales_total,
            COALESCE((SELECT sum(refund_total) FROM sale_returns WHERE shift_id = s.id), 0)
              + COALESCE((SELECT sum(amount) FROM repair_order_payments WHERE shift_id = s.id AND kind = 'refund'), 0)
              AS refunds_total,
            (SELECT count(DISTINCT order_id)::int FROM repair_order_payments
              WHERE shift_id = s.id AND kind <> 'refund') AS orders_count,
            COALESCE((SELECT sum(amount) FROM repair_order_payments
                       WHERE shift_id = s.id AND kind <> 'refund'), 0) AS orders_collected,
            COALESCE((SELECT sum(amount) FROM purchase_payments WHERE shift_id = s.id), 0) AS supplier_payments,
            COALESCE((SELECT sum(amount) FROM cash_movements WHERE shift_id = s.id AND kind = 'in'), 0) AS cash_in,
            COALESCE((SELECT sum(amount) FROM cash_movements WHERE shift_id = s.id AND kind = 'out'), 0) AS cash_out,
            COALESCE((SELECT sum(refund_total) FROM sale_returns
                       WHERE shift_id = s.id AND refund_method = 'cash'), 0)
              + COALESCE((SELECT sum(amount) FROM repair_order_payments
                           WHERE shift_id = s.id AND kind = 'refund' AND method = 'cash'), 0) AS cash_refunds
       FROM cash_shifts s
      WHERE s.id = $1`,
    [shiftId],
  );
  const row = rows[0];
  if (!row) return null;

  const { rows: methodRows } = await client.query<{ method: PaymentMethod; amount: string }>(
    `SELECT method, sum(amount) AS amount
       FROM (SELECT p.method, p.amount
               FROM sale_payments p
               JOIN sales s ON s.id = p.sale_id
              WHERE s.shift_id = $1
             UNION ALL
             SELECT method, amount
               FROM repair_order_payments
              WHERE shift_id = $1 AND kind <> 'refund') payments
      GROUP BY method`,
    [shiftId],
  );
  const paymentsByMethod = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, "0.00"])) as Record<
    PaymentMethod,
    string
  >;
  for (const methodRow of methodRows) paymentsByMethod[methodRow.method] = fromCents(toCents(methodRow.amount));

  const expectedCash =
    toCents(row.opening_amount) +
    toCents(paymentsByMethod.cash) +
    toCents(row.cash_in) -
    toCents(row.cash_out) -
    toCents(row.cash_refunds) -
    toCents(row.supplier_payments);

  return {
    id: row.id,
    openedAt: row.opened_at,
    openedByName: row.opened_by_name,
    openingAmount: row.opening_amount,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    expectedAmount: row.expected_amount,
    countedAmount: row.counted_amount,
    closingNotes: row.closing_notes,
    salesCount: row.sales_count,
    salesTotal: fromCents(toCents(row.sales_total)),
    ordersCount: row.orders_count,
    ordersCollected: fromCents(toCents(row.orders_collected)),
    refundsTotal: fromCents(toCents(row.refunds_total)),
    paymentsByMethod,
    cashIn: fromCents(toCents(row.cash_in)),
    cashOut: fromCents(toCents(row.cash_out)),
    cashRefunds: fromCents(toCents(row.cash_refunds)),
    supplierPayments: fromCents(toCents(row.supplier_payments)),
    expectedCash: fromCents(expectedCash),
  };
}

async function queryShiftOrderPayments(client: PoolClient, shiftId: string): Promise<ShiftOrderPayment[]> {
  const { rows } = await client.query<{
    id: string;
    order_id: string;
    folio: number;
    customer_name: string;
    kind: ShiftOrderPayment["kind"];
    method: PaymentMethod;
    amount: string;
    user_name: string;
    created_at: Date;
  }>(
    `SELECT p.id, p.order_id, o.folio::int AS folio, btrim(c.first_name || ' ' || c.last_name) AS customer_name,
            p.kind, p.method, p.amount, p.user_name, p.created_at
       FROM repair_order_payments p
       JOIN repair_orders o ON o.id = p.order_id
       JOIN customers c ON c.id = o.customer_id
      WHERE p.shift_id = $1
      ORDER BY p.created_at DESC`,
    [shiftId],
  );
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    folio: row.folio,
    customerName: row.customer_name,
    kind: row.kind,
    method: row.method,
    amount: row.amount,
    userName: row.user_name,
    createdAt: row.created_at,
  }));
}

// Lanza un error si en la caja no hay efectivo suficiente para una salida.
export async function assertCashAvailable(client: PoolClient, shiftId: string, cents: number, purpose: string) {
  if (cents <= 0) return;
  const summary = await loadShiftSummary(client, shiftId);
  const available = toCents(summary?.expectedCash ?? "0");
  if (cents > available) {
    throw new CashError(`Solo hay ${formatMoney(fromCents(available))} en efectivo en la caja ${purpose}.`);
  }
}

// Revisa pagos de un cobro (venta, anticipo o saldo de una orden): deben cubrir exactamente
// `totalCents`, con un solo pago en efectivo y cuentas activas en las transferencias.
export async function validatePayments(
  client: PoolClient,
  payments: PaymentInput[],
  options: { totalCents: number; cashReceivedCents: number | null },
) {
  if (payments.some((payment) => !Number.isInteger(payment.amountCents) || payment.amountCents <= 0)) {
    throw new CashError("Cada pago debe ser mayor a 0.");
  }

  const paid = sumCents(payments.map((payment) => payment.amountCents));
  if (paid !== options.totalCents) {
    throw new CashError(
      `Los pagos suman ${formatMoney(fromCents(paid))} y el total es ${formatMoney(fromCents(options.totalCents))}.`,
    );
  }

  const cashPayments = payments.filter((payment) => payment.method === "cash");
  if (cashPayments.length > 1) throw new CashError("Registra el efectivo en un solo pago.");

  let cashReceived: number | null = null;
  let change = 0;
  if (cashPayments[0]) {
    cashReceived = options.cashReceivedCents ?? cashPayments[0].amountCents;
    if (cashReceived < cashPayments[0].amountCents) {
      throw new CashError("El efectivo recibido no cubre el pago en efectivo.");
    }
    change = cashReceived - cashPayments[0].amountCents;
  }

  const transferAccounts = [
    ...new Set(payments.filter((payment) => payment.method === "transfer").map((payment) => payment.bankAccountId)),
  ];
  if (transferAccounts.some((accountId) => !accountId)) {
    throw new CashError("Elige la cuenta que recibió la transferencia.");
  }
  if (transferAccounts.length > 0) {
    const { rows } = await client.query("SELECT id FROM bank_accounts WHERE id = ANY($1::uuid[]) AND is_active", [
      transferAccounts,
    ]);
    if (rows.length !== transferAccounts.length) {
      throw new CashError("La cuenta bancaria elegida ya no está disponible.");
    }
  }

  return { cashReceived, change };
}

export async function getOpenShift(tenantId: string) {
  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client);
    return shiftId ? loadShiftSummary(client, shiftId) : null;
  });
}

export async function getShift(
  tenantId: string,
  shiftId: string,
): Promise<{
  summary: ShiftSummary;
  movements: CashMovement[];
  sales: SaleSummary[];
  orderPayments: ShiftOrderPayment[];
} | null> {
  if (!UUID_PATTERN.test(shiftId)) return null;

  return withTenantDb(tenantId, async (client) => {
    const summary = await loadShiftSummary(client, shiftId);
    if (!summary) return null;

    const { rows: movementRows } = await client.query<{
      id: string;
      kind: "in" | "out";
      amount: string;
      reason: string;
      user_name: string;
      created_at: Date;
    }>(
      `SELECT id, kind, amount, reason, user_name, created_at
         FROM cash_movements WHERE shift_id = $1
       UNION ALL
       SELECT pp.id, 'out', pp.amount, 'Pago a ' || s.name || ' · Compra #' || p.folio, pp.user_name, pp.created_at
         FROM purchase_payments pp
         JOIN purchases p ON p.id = pp.purchase_id
         JOIN suppliers s ON s.id = p.supplier_id
        WHERE pp.shift_id = $1
       ORDER BY created_at DESC`,
      [shiftId],
    );

    return {
      summary,
      movements: movementRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: row.amount,
        reason: row.reason,
        userName: row.user_name,
        createdAt: row.created_at,
      })),
      sales: await querySales(client, { shiftId }),
      orderPayments: await queryShiftOrderPayments(client, shiftId),
    };
  });
}

export async function listShifts(tenantId: string): Promise<ShiftSummary[]> {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM cash_shifts ORDER BY opened_at DESC LIMIT 30",
    );
    const summaries: ShiftSummary[] = [];
    for (const row of rows) {
      const summary = await loadShiftSummary(client, row.id);
      if (summary) summaries.push(summary);
    }
    return summaries;
  });
}

export async function openShift(tenantId: string, actor: CashActor, openingCents: number) {
  if (!Number.isInteger(openingCents) || openingCents < 0) throw new CashError("Fondo inicial no válido.");

  try {
    return await withTenantDb(tenantId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO cash_shifts (opening_amount, opened_by, opened_by_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [fromCents(openingCents), actor.userId, actor.userName],
      );
      return rows[0].id;
    });
  } catch (error) {
    if (isUniqueViolation(error, "cash_shifts_single_open")) throw new CashError("Ya hay una caja abierta.");
    throw error;
  }
}

export async function addCashMovement(
  tenantId: string,
  actor: CashActor,
  movement: { kind: "in" | "out"; amountCents: number; reason: string },
) {
  if (!Number.isInteger(movement.amountCents) || movement.amountCents <= 0) {
    throw new CashError("El importe debe ser mayor a 0.");
  }

  await withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client, true);
    if (!shiftId) throw new CashError("No hay una caja abierta.");

    if (movement.kind === "out") {
      const summary = await loadShiftSummary(client, shiftId);
      const available = toCents(summary?.expectedCash ?? "0");
      if (movement.amountCents > available) {
        throw new CashError(`Solo hay ${formatMoney(fromCents(available))} en efectivo en la caja.`);
      }
    }

    await client.query(
      `INSERT INTO cash_movements (shift_id, kind, amount, reason, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [shiftId, movement.kind, fromCents(movement.amountCents), movement.reason, actor.userId, actor.userName],
    );
  });
}

export async function closeShift(
  tenantId: string,
  actor: CashActor,
  shiftId: string,
  closing: { countedCents: number; notes: string },
) {
  assertIds(shiftId);
  if (!Number.isInteger(closing.countedCents) || closing.countedCents < 0) {
    throw new CashError("Efectivo contado no válido.");
  }

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ closed_at: Date | null }>(
      "SELECT closed_at FROM cash_shifts WHERE id = $1 FOR UPDATE",
      [shiftId],
    );
    if (!rows[0]) throw new CashError("El turno ya no existe.");
    if (rows[0].closed_at) throw new CashError("Esta caja ya se cerró.");

    const summary = await loadShiftSummary(client, shiftId);
    const expectedCents = toCents(summary?.expectedCash ?? "0");

    await client.query(
      `UPDATE cash_shifts
          SET expected_amount = $1, counted_amount = $2, closing_notes = $3,
              closed_by = $4, closed_by_name = $5, closed_at = now()
        WHERE id = $6`,
      [fromCents(expectedCents), fromCents(closing.countedCents), closing.notes, actor.userId, actor.userName, shiftId],
    );

    return { expected: fromCents(expectedCents), difference: fromCents(closing.countedCents - expectedCents) };
  });
}

// ---------------------------------------------------------------------------
// Cuentas bancarias
// ---------------------------------------------------------------------------

export async function listBankAccounts(tenantId: string, options: { activeOnly: boolean }): Promise<BankAccount[]> {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      bank_name: string;
      holder_name: string;
      clabe: string;
      alias: string;
      is_active: boolean;
    }>(
      `SELECT id, bank_name, holder_name, clabe, alias, is_active
         FROM bank_accounts
        WHERE is_active OR NOT $1
        ORDER BY is_active DESC, lower(bank_name), lower(alias)`,
      [options.activeOnly],
    );
    return rows.map((row) => ({
      id: row.id,
      bankName: row.bank_name,
      holderName: row.holder_name,
      clabe: row.clabe,
      alias: row.alias,
      isActive: row.is_active,
    }));
  });
}

function translateAccountError(error: unknown): never {
  if (isUniqueViolation(error, "bank_accounts_clabe_key")) throw new CashError("Ya existe una cuenta con esta CLABE.");
  throw error;
}

export async function createBankAccount(tenantId: string, input: BankAccountInput) {
  try {
    await withTenantDb(tenantId, (client) =>
      client.query("INSERT INTO bank_accounts (bank_name, holder_name, clabe, alias) VALUES ($1, $2, $3, $4)", [
        input.bankName,
        input.holderName,
        input.clabe,
        input.alias,
      ]),
    );
  } catch (error) {
    translateAccountError(error);
  }
}

export async function updateBankAccount(tenantId: string, accountId: string, input: BankAccountInput) {
  assertIds(accountId);
  try {
    await withTenantDb(tenantId, async (client) => {
      const { rowCount } = await client.query(
        "UPDATE bank_accounts SET bank_name = $1, holder_name = $2, clabe = $3, alias = $4 WHERE id = $5",
        [input.bankName, input.holderName, input.clabe, input.alias, accountId],
      );
      if (!rowCount) throw new CashError("La cuenta ya no existe.");
    });
  } catch (error) {
    translateAccountError(error);
  }
}

export async function setBankAccountActive(tenantId: string, accountId: string, active: boolean) {
  assertIds(accountId);
  await withTenantDb(tenantId, (client) =>
    client.query("UPDATE bank_accounts SET is_active = $1 WHERE id = $2", [active, accountId]),
  );
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function searchSellableItems(tenantId: string, query: string): Promise<SellableItem[]> {
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
    }>(
      `SELECT id, name, barcode, sale_price, tax_rate, tax_included, track_stock, stock
         FROM items
        WHERE is_active AND is_for_sale AND (name ILIKE $1 OR barcode = $2)
        ORDER BY (barcode = $2) DESC NULLS LAST, lower(name)
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
    }));
  });
}

export async function createSale(tenantId: string, actor: CashActor, input: SaleInput) {
  assertIds(
    input.customerId,
    ...input.lines.map((line) => line.itemId),
    ...input.payments.map((payment) => payment.bankAccountId),
  );

  // Agrupa renglones repetidos del mismo artículo.
  const quantities = new Map<string, number>();
  for (const line of input.lines) {
    quantities.set(line.itemId.toLowerCase(), (quantities.get(line.itemId.toLowerCase()) ?? 0) + line.quantity);
  }
  if (quantities.size === 0) throw new CashError("Agrega al menos un artículo.");
  if ([...quantities.values()].some((quantity) => !Number.isInteger(quantity) || quantity < 1 || quantity > 100_000)) {
    throw new CashError("Cantidad no válida.");
  }
  if (input.payments.some((payment) => !Number.isInteger(payment.amountCents) || payment.amountCents <= 0)) {
    throw new CashError("Cada pago debe ser mayor a 0.");
  }

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client, true);
    if (!shiftId) throw new CashError("Abre la caja antes de vender.");

    // Cliente obligatorio; se guarda también su nombre al momento de la venta.
    const { rows: customerRows } = await client.query<{ first_name: string; last_name: string; is_active: boolean }>(
      "SELECT first_name, last_name, is_active FROM customers WHERE id = $1",
      [input.customerId],
    );
    const customer = customerRows[0];
    if (!customer || !customer.is_active) throw new CashError("Elige un cliente registrado para la venta.");
    const customerName = `${customer.first_name} ${customer.last_name}`.trim();

    // Bloquea los artículos (en orden fijo para evitar interbloqueos) antes de revisar existencias.
    const { rows: itemRows } = await client.query<{
      id: string;
      name: string;
      barcode: string | null;
      sale_price: string;
      tax_rate: string;
      tax_included: boolean;
      track_stock: boolean;
      stock: number;
      is_active: boolean;
      is_for_sale: boolean;
    }>(
      `SELECT id, name, barcode, sale_price, tax_rate, tax_included, track_stock, stock, is_active, is_for_sale
         FROM items
        WHERE id = ANY($1::uuid[])
        ORDER BY id
          FOR UPDATE`,
      [[...quantities.keys()]],
    );
    const itemsById = new Map(itemRows.map((item) => [item.id, item]));

    const lines = [...quantities].map(([itemId, quantity]) => {
      const item = itemsById.get(itemId);
      if (!item || !item.is_active || !item.is_for_sale) {
        throw new CashError("Uno de los artículos ya no está disponible para venta.");
      }
      if (item.track_stock && item.stock < quantity) {
        throw new CashError(`No hay suficientes existencias de ${item.name} (quedan ${item.stock}).`);
      }
      const amounts = computeLine({
        unitPriceCents: toCents(item.sale_price),
        quantity,
        taxRate: Number(item.tax_rate),
        taxIncluded: item.tax_included,
      });
      return { item, quantity, ...amounts };
    });

    const subtotal = sumCents(lines.map((line) => line.subtotal));
    const taxTotal = sumCents(lines.map((line) => line.tax));
    const total = sumCents(lines.map((line) => line.total));

    // Pagos: deben cubrir exactamente el total; el efectivo recibido de más es cambio.
    const { cashReceived, change } = await validatePayments(client, input.payments, {
      totalCents: total,
      cashReceivedCents: input.cashReceivedCents,
    });

    const { rows: saleRows } = await client.query<{ id: string; folio: number }>(
      `INSERT INTO sales (shift_id, customer_id, customer_name, subtotal, tax_total, total, cash_received,
                          change_amount, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, folio::int AS folio`,
      [
        shiftId,
        input.customerId,
        customerName,
        fromCents(subtotal),
        fromCents(taxTotal),
        fromCents(total),
        cashReceived === null ? null : fromCents(cashReceived),
        fromCents(change),
        actor.userId,
        actor.userName,
      ],
    );
    const sale = saleRows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO sale_items (sale_id, item_id, item_name, barcode, track_stock, quantity, unit_price,
                                 tax_rate, tax_included, subtotal, tax_amount, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          sale.id,
          line.item.id,
          line.item.name,
          line.item.barcode,
          line.item.track_stock,
          line.quantity,
          line.item.sale_price,
          line.item.tax_rate,
          line.item.tax_included,
          fromCents(line.subtotal),
          fromCents(line.tax),
          fromCents(line.total),
        ],
      );

      // Solo los artículos que controlan existencias generan movimiento de inventario.
      if (line.item.track_stock) {
        await applyStockMovement(client, actor, line.item.id, {
          kind: "sale",
          quantity: -line.quantity,
          unitCost: null,
          supplierId: null,
          note: `Venta #${sale.folio}`,
        });
      }
    }

    for (const payment of input.payments) {
      await client.query(
        `INSERT INTO sale_payments (sale_id, method, amount, bank_account_id, reference)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          sale.id,
          payment.method,
          fromCents(payment.amountCents),
          payment.method === "transfer" ? payment.bankAccountId : null,
          payment.reference,
        ],
      );
    }

    return { id: sale.id, folio: sale.folio, change: fromCents(change) };
  });
}

async function querySales(client: PoolClient, filter: { shiftId?: string; search?: string }): Promise<SaleSummary[]> {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter.shiftId) {
    params.push(filter.shiftId);
    conditions.push(`s.shift_id = $${params.length}`);
  }
  if (filter.search) {
    params.push(filter.search.replace(/^#/, ""), `%${escapeLike(filter.search)}%`);
    conditions.push(`(s.folio::text = $${params.length - 1} OR s.customer_name ILIKE $${params.length})`);
  }

  const { rows } = await client.query<{
    id: string;
    folio: number;
    created_at: Date;
    customer_name: string;
    total: string;
    refunded_total: string;
    user_name: string;
    item_count: number;
  }>(
    `SELECT s.id, s.folio::int AS folio, s.created_at, s.customer_name, s.total, s.refunded_total, s.user_name,
            (SELECT COALESCE(sum(quantity), 0)::int FROM sale_items WHERE sale_id = s.id) AS item_count
       FROM sales s
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY s.created_at DESC
      LIMIT 200`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    folio: row.folio,
    createdAt: row.created_at,
    customerName: row.customer_name,
    total: row.total,
    refundedTotal: row.refunded_total,
    userName: row.user_name,
    itemCount: row.item_count,
  }));
}

export async function listSales(tenantId: string, options: { search: string }) {
  return withTenantDb(tenantId, (client) => querySales(client, { search: options.search.trim().slice(0, 100) }));
}

export async function getSale(tenantId: string, saleId: string): Promise<SaleDetail | null> {
  if (!UUID_PATTERN.test(saleId)) return null;

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      folio: number;
      shift_id: string;
      created_at: Date;
      customer_name: string;
      customer_id: string | null;
      customer_phone: string | null;
      customer_email: string | null;
      subtotal: string;
      tax_total: string;
      total: string;
      cash_received: string | null;
      change_amount: string;
      refunded_total: string;
      user_name: string;
    }>(
      `SELECT s.id, s.folio::int AS folio, s.shift_id, s.created_at, s.customer_name, s.customer_id,
              c.phone AS customer_phone, c.email AS customer_email, s.subtotal, s.tax_total, s.total,
              s.cash_received, s.change_amount, s.refunded_total, s.user_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.id = $1`,
      [saleId],
    );
    const sale = rows[0];
    if (!sale) return null;

    const { rows: itemRows } = await client.query<{
      id: string;
      item_id: string | null;
      item_name: string;
      barcode: string | null;
      quantity: number;
      returned_quantity: number;
      unit_price: string;
      tax_rate: string;
      tax_included: boolean;
      subtotal: string;
      tax_amount: string;
      total: string;
      refunded_amount: string;
    }>(
      `SELECT id, item_id, item_name, barcode, quantity, returned_quantity, unit_price, tax_rate, tax_included,
              subtotal, tax_amount, total, refunded_amount
         FROM sale_items WHERE sale_id = $1 ORDER BY item_name`,
      [saleId],
    );

    const { rows: paymentRows } = await client.query<{
      id: string;
      method: PaymentMethod;
      amount: string;
      reference: string;
      bank_name: string | null;
      holder_name: string | null;
      clabe: string | null;
    }>(
      `SELECT p.id, p.method, p.amount, p.reference, b.bank_name, b.holder_name, b.clabe
         FROM sale_payments p
         LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
        WHERE p.sale_id = $1`,
      [saleId],
    );

    const { rows: returnRows } = await client.query<{
      id: string;
      created_at: Date;
      refund_method: PaymentMethod;
      refund_total: string;
      reason: string;
      restocked: boolean;
      user_name: string;
      items: { item_name: string; quantity: number; amount: string }[];
    }>(
      `SELECT r.id, r.created_at, r.refund_method, r.refund_total, r.reason, r.restocked, r.user_name,
              COALESCE(json_agg(json_build_object('item_name', si.item_name, 'quantity', ri.quantity, 'amount', ri.amount)
                       ORDER BY si.item_name) FILTER (WHERE ri.sale_item_id IS NOT NULL), '[]') AS items
         FROM sale_returns r
         LEFT JOIN sale_return_items ri ON ri.return_id = r.id
         LEFT JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.sale_id = $1
        GROUP BY r.id
        ORDER BY r.created_at DESC`,
      [saleId],
    );

    return {
      id: sale.id,
      folio: sale.folio,
      shiftId: sale.shift_id,
      createdAt: sale.created_at,
      customerName: sale.customer_name,
      customerId: sale.customer_id,
      customerPhone: sale.customer_phone ?? "",
      customerEmail: sale.customer_email ?? "",
      subtotal: sale.subtotal,
      taxTotal: sale.tax_total,
      total: sale.total,
      cashReceived: sale.cash_received,
      changeAmount: sale.change_amount,
      refundedTotal: sale.refunded_total,
      userName: sale.user_name,
      items: itemRows.map((row) => ({
        id: row.id,
        itemId: row.item_id,
        itemName: row.item_name,
        barcode: row.barcode,
        quantity: row.quantity,
        returnedQuantity: row.returned_quantity,
        unitPrice: row.unit_price,
        taxRate: row.tax_rate,
        taxIncluded: row.tax_included,
        subtotal: row.subtotal,
        taxAmount: row.tax_amount,
        total: row.total,
        refundedAmount: row.refunded_amount,
      })),
      payments: paymentRows.map((row) => ({
        id: row.id,
        method: row.method,
        amount: row.amount,
        reference: row.reference,
        bankName: row.bank_name,
        holderName: row.holder_name,
        clabe: row.clabe,
      })),
      returns: returnRows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        refundMethod: row.refund_method,
        refundTotal: row.refund_total,
        reason: row.reason,
        restocked: row.restocked,
        userName: row.user_name,
        items: row.items.map((item) => ({
          itemName: item.item_name,
          quantity: item.quantity,
          amount: fromCents(toCents(String(item.amount))),
        })),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Devoluciones
// ---------------------------------------------------------------------------

export async function createReturn(tenantId: string, actor: CashActor, saleId: string, input: ReturnInput) {
  assertIds(saleId, ...input.lines.map((line) => line.saleItemId));

  const requested = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) throw new CashError("Cantidad no válida.");
    if (line.quantity > 0) {
      const key = line.saleItemId.toLowerCase();
      requested.set(key, (requested.get(key) ?? 0) + line.quantity);
    }
  }
  if (requested.size === 0) throw new CashError("Indica cuántas piezas se devuelven.");
  if (!input.reason) throw new CashError("Escribe el motivo de la devolución.");

  return withTenantDb(tenantId, async (client) => {
    const shiftId = await findOpenShiftId(client, true);
    if (!shiftId) throw new CashError("Abre la caja para registrar devoluciones.");

    const { rows: saleRows } = await client.query<{ id: string; folio: number }>(
      "SELECT id, folio::int AS folio FROM sales WHERE id = $1 FOR UPDATE",
      [saleId],
    );
    const sale = saleRows[0];
    if (!sale) throw new CashError("La venta ya no existe.");

    const { rows: saleItems } = await client.query<{
      id: string;
      item_id: string | null;
      item_name: string;
      quantity: number;
      returned_quantity: number;
      total: string;
      refunded_amount: string;
    }>(
      `SELECT id, item_id, item_name, quantity, returned_quantity, total, refunded_amount
         FROM sale_items WHERE sale_id = $1 ORDER BY id FOR UPDATE`,
      [saleId],
    );
    const saleItemsById = new Map(saleItems.map((item) => [item.id, item]));

    const lines = [...requested].map(([saleItemId, quantity]) => {
      const saleItem = saleItemsById.get(saleItemId);
      if (!saleItem) throw new CashError("Uno de los artículos no pertenece a esta venta.");
      const remaining = saleItem.quantity - saleItem.returned_quantity;
      if (quantity > remaining) {
        throw new CashError(
          remaining === 0
            ? `${saleItem.item_name} ya se devolvió por completo.`
            : `De ${saleItem.item_name} solo quedan ${remaining} por devolver.`,
        );
      }
      const amount = refundForLine(
        {
          totalCents: toCents(saleItem.total),
          quantity: saleItem.quantity,
          returnedQuantity: saleItem.returned_quantity,
          refundedCents: toCents(saleItem.refunded_amount),
        },
        quantity,
      );
      return { saleItem, quantity, amount };
    });

    const refundTotal = sumCents(lines.map((line) => line.amount));

    if (input.refundMethod === "cash" && refundTotal > 0) {
      const summary = await loadShiftSummary(client, shiftId);
      const available = toCents(summary?.expectedCash ?? "0");
      if (refundTotal > available) {
        throw new CashError(`Solo hay ${formatMoney(fromCents(available))} en efectivo en la caja para reembolsar.`);
      }
    }

    const { rows: returnRows } = await client.query<{ id: string }>(
      `INSERT INTO sale_returns (sale_id, shift_id, refund_method, refund_total, reason, restocked, user_id, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [saleId, shiftId, input.refundMethod, fromCents(refundTotal), input.reason, input.restock, actor.userId, actor.userName],
    );
    const returnId = returnRows[0].id;

    for (const { saleItem, quantity, amount } of lines) {
      await client.query(
        "INSERT INTO sale_return_items (return_id, sale_item_id, quantity, amount) VALUES ($1, $2, $3, $4)",
        [returnId, saleItem.id, quantity, fromCents(amount)],
      );
      await client.query(
        `UPDATE sale_items
            SET returned_quantity = returned_quantity + $1, refunded_amount = refunded_amount + $2
          WHERE id = $3`,
        [quantity, fromCents(amount), saleItem.id],
      );

      // Regresa las piezas al inventario si el artículo sigue controlando existencias.
      if (input.restock && saleItem.item_id) {
        const { rows: currentRows } = await client.query<{ track_stock: boolean }>(
          "SELECT track_stock FROM items WHERE id = $1",
          [saleItem.item_id],
        );
        if (currentRows[0]?.track_stock) {
          await applyStockMovement(
            client,
            actor,
            saleItem.item_id,
            { kind: "return", quantity, unitCost: null, supplierId: null, note: `Devolución de la venta #${sale.folio}` },
            { requireActive: false },
          );
        }
      }
    }

    await client.query("UPDATE sales SET refunded_total = refunded_total + $1 WHERE id = $2", [
      fromCents(refundTotal),
      saleId,
    ]);

    return { returnId, refundTotal: fromCents(refundTotal) };
  });
}
