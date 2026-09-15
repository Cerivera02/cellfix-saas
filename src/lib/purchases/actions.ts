"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantPermission } from "@/lib/auth/session";
import { CashError } from "@/lib/cash/core";
import { parseMoneyCents } from "@/lib/cash/form";
import { isPaymentMethod } from "@/lib/cash/labels";
import { isValidDay } from "@/lib/dates";
import { InventoryError } from "@/lib/inventory/core";
import {
  PurchaseError,
  addPurchasePayment,
  createPurchase,
  searchPurchasableItems,
  type PurchasableItem,
  type SupplierPaymentInput,
} from "@/lib/purchases/core";

// Acciones de compras. Exigen "Registrar compras"; tomar efectivo de la caja exige además operarla.

export type SupplierPaymentRequest = {
  method: string;
  amount: string;
  bankAccountId: string | null;
  reference: string;
  fromDrawer: boolean;
};

export type PurchaseRequest = {
  supplierId: string;
  invoiceNumber: string;
  purchasedOn: string;
  terms: string;
  dueOn: string;
  notes: string;
  lines: { itemId: string; quantity: number; unitCost: string; repairOrderId: string | null }[];
  payments: SupplierPaymentRequest[];
};

function knownMessage(error: unknown) {
  if (error instanceof PurchaseError || error instanceof CashError || error instanceof InventoryError) return error.message;
  console.error("Error en compras:", error);
  return null;
}

function parseSupplierPayments(value: unknown): SupplierPaymentInput[] | { message: string } {
  if (!Array.isArray(value) || value.length > 10) return { message: "Solicitud no válida." };

  const payments: SupplierPaymentInput[] = [];
  for (const payment of value as Partial<SupplierPaymentRequest>[]) {
    const method = String(payment?.method ?? "");
    if (!isPaymentMethod(method)) return { message: "Método de pago no válido." };
    const amountCents = parseMoneyCents(String(payment?.amount ?? ""));
    if (amountCents === null || amountCents <= 0) return { message: "Revisa los importes de pago." };
    payments.push({
      method,
      amountCents,
      bankAccountId: method === "transfer" && payment?.bankAccountId ? String(payment.bankAccountId) : null,
      reference: String(payment?.reference ?? "").trim().slice(0, 60),
      fromDrawer: method === "cash" && payment?.fromDrawer === true,
    });
  }
  return payments;
}

export async function searchPurchaseItemsAction(query: string): Promise<PurchasableItem[]> {
  const session = await requireTenantPermission("purchases.manage");
  return searchPurchasableItems(session.tenant.id, typeof query === "string" ? query : "");
}

// Solo devuelve algo si hay error; si la compra se registra, redirige a su detalle.
export async function createPurchaseAction(request: PurchaseRequest): Promise<{ message: string }> {
  const session = await requireTenantPermission("purchases.manage");

  if (typeof request !== "object" || request === null || !Array.isArray(request.lines)) {
    return { message: "Solicitud no válida." };
  }

  const supplierId = String(request.supplierId ?? "");
  if (!supplierId) return { message: "Elige el proveedor." };

  const purchasedOn = String(request.purchasedOn ?? "");
  if (!isValidDay(purchasedOn)) return { message: "Revisa la fecha de compra." };

  const terms = request.terms === "credit" ? "credit" : request.terms === "cash" ? "cash" : null;
  if (!terms) return { message: "Elige si la compra es de contado o a crédito." };

  const dueOn = terms === "credit" && request.dueOn ? String(request.dueOn) : null;
  if (dueOn && !isValidDay(dueOn)) return { message: "Revisa la fecha de vencimiento." };

  if (request.lines.length === 0) return { message: "Agrega al menos un artículo." };
  if (request.lines.length > 200) return { message: "Registra como máximo 200 renglones por compra." };

  const lines = [];
  for (const line of request.lines) {
    const unitCostCents = parseMoneyCents(String(line?.unitCost ?? ""));
    if (unitCostCents === null) return { message: "Revisa los costos por pieza." };
    lines.push({
      itemId: String(line?.itemId ?? ""),
      quantity: Number(line?.quantity),
      unitCostCents,
      repairOrderId: line?.repairOrderId ? String(line.repairOrderId) : null,
    });
  }

  const payments = parseSupplierPayments(request.payments ?? []);
  if ("message" in payments) return payments;
  if (payments.some((payment) => payment.fromDrawer) && !session.permissions.includes("cash.operate")) {
    return { message: "No tienes permiso para tomar efectivo de la caja." };
  }

  let purchaseId: string;
  try {
    const purchase = await createPurchase(
      session.tenant.id,
      { userId: session.user.id, userName: session.user.name },
      {
        supplierId,
        invoiceNumber: String(request.invoiceNumber ?? "").trim().slice(0, 60),
        purchasedOn,
        terms,
        dueOn,
        notes: String(request.notes ?? "").trim().slice(0, 500),
        lines,
        payments,
      },
    );
    purchaseId = purchase.id;
  } catch (error) {
    return { message: knownMessage(error) ?? "No pudimos registrar la compra. Inténtalo de nuevo." };
  }

  redirect(`/dashboard/purchases/${purchaseId}?registrada=1`);
}

export async function addPurchasePaymentAction(
  purchaseId: string,
  request: { payments: SupplierPaymentRequest[] },
): Promise<{ message?: string; success?: string }> {
  const session = await requireTenantPermission("purchases.manage");
  const payments = parseSupplierPayments(request?.payments);
  if ("message" in payments) return payments;
  if (payments.some((payment) => payment.fromDrawer) && !session.permissions.includes("cash.operate")) {
    return { message: "No tienes permiso para tomar efectivo de la caja." };
  }

  try {
    await addPurchasePayment(
      session.tenant.id,
      { userId: session.user.id, userName: session.user.name },
      purchaseId,
      payments,
    );
  } catch (error) {
    return { message: knownMessage(error) ?? "No pudimos registrar el abono. Inténtalo de nuevo." };
  }

  refresh();
  return { success: "Abono registrado." };
}
