"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantPermission } from "@/lib/auth/session";
import {
  CashError,
  addCashMovement,
  closeShift,
  createBankAccount,
  createReturn,
  createSale,
  openShift,
  searchSellableItems,
  setBankAccountActive,
  updateBankAccount,
  type PaymentInput,
  type SellableItem,
} from "@/lib/cash/core";
import { parseBankAccountForm, parseMoneyCents } from "@/lib/cash/form";
import { isPaymentMethod } from "@/lib/cash/labels";
import type { FormState } from "@/lib/form-state";
import { InventoryError } from "@/lib/inventory/core";
import { formatMoney } from "@/lib/inventory/format";
import type { Permission } from "@/lib/permissions";
import { readField } from "@/lib/validation";

// Acciones de la Caja. El taller sale siempre de la sesión y cada acción exige su permiso.

async function authorize(permission: Permission) {
  const session = await requireTenantPermission(permission);
  return { tenantId: session.tenant.id, actor: { userId: session.user.id, userName: session.user.name } };
}

type Context = { fields?: Record<string, string>; selections?: Record<string, string[]> };

function toErrorState(error: unknown, context: Context = {}): FormState {
  if (error instanceof CashError || error instanceof InventoryError) return { ...context, message: error.message };
  console.error("Error en la caja:", error);
  return { ...context, message: "No pudimos guardar los cambios. Inténtalo de nuevo." };
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

export async function openShiftAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize("cash.operate");
  const fields = { openingAmount: readField(formData, "openingAmount", 20) };
  const openingCents = fields.openingAmount ? parseMoneyCents(fields.openingAmount) : 0;
  if (openingCents === null) return { fields, errors: { openingAmount: "Usa un importe como 500 o 500.50." } };

  try {
    await openShift(tenantId, actor, openingCents);
  } catch (error) {
    return toErrorState(error, { fields });
  }

  refresh();
  return { success: "Caja abierta." };
}

export async function addCashMovementAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize("cash.operate");
  const fields = {
    kind: readField(formData, "kind", 3),
    amount: readField(formData, "amount", 20),
    reason: readField(formData, "reason", 200),
  };
  const context = { fields };
  const errors: Record<string, string> = {};

  if (fields.kind !== "in" && fields.kind !== "out") errors.kind = "Elige entrada o salida.";
  const amountCents = parseMoneyCents(fields.amount);
  if (amountCents === null || amountCents <= 0) errors.amount = "Escribe un importe mayor a 0.";
  if (!fields.reason) errors.reason = "Escribe el motivo.";
  if (Object.keys(errors).length > 0) return { ...context, errors };

  try {
    await addCashMovement(tenantId, actor, {
      kind: fields.kind as "in" | "out",
      amountCents: amountCents ?? 0,
      reason: fields.reason,
    });
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: fields.kind === "in" ? "Entrada registrada." : "Salida registrada." };
}

export async function closeShiftAction(shiftId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize("cash.operate");
  const fields = {
    countedAmount: readField(formData, "countedAmount", 20),
    notes: readField(formData, "notes", 500),
  };
  const countedCents = parseMoneyCents(fields.countedAmount);
  if (countedCents === null) {
    return { fields, errors: { countedAmount: "Escribe el efectivo contado, por ejemplo 1250.50." } };
  }

  try {
    await closeShift(tenantId, actor, shiftId, { countedCents, notes: fields.notes });
  } catch (error) {
    return toErrorState(error, { fields });
  }

  redirect(`/dashboard/cash/shifts/${shiftId}`);
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export async function searchItemsAction(query: string): Promise<SellableItem[]> {
  const { tenantId } = await authorize("sales.create");
  return searchSellableItems(tenantId, typeof query === "string" ? query : "");
}

export type SaleRequest = {
  customerId: string;
  lines: { itemId: string; quantity: number }[];
  payments: { method: string; amount: string; bankAccountId: string | null; reference: string }[];
  cashReceived: string | null;
};

// Solo devuelve algo si hay error; si la venta se registra, redirige a su detalle.
export async function createSaleAction(request: SaleRequest): Promise<{ message: string }> {
  const { tenantId, actor } = await authorize("sales.create");

  // El objeto llega del navegador: se valida todo aquí. Los precios se leen de la base de datos.
  if (
    typeof request !== "object" ||
    request === null ||
    !Array.isArray(request.lines) ||
    !Array.isArray(request.payments) ||
    request.lines.length > 200 ||
    request.payments.length > 10
  ) {
    return { message: "Solicitud no válida." };
  }

  const payments: PaymentInput[] = [];
  for (const payment of request.payments) {
    const method = String(payment?.method ?? "");
    if (!isPaymentMethod(method)) return { message: "Método de pago no válido." };
    const amountCents = parseMoneyCents(String(payment?.amount ?? ""));
    if (amountCents === null || amountCents <= 0) return { message: "Revisa los importes de pago." };
    payments.push({
      method,
      amountCents,
      bankAccountId: method === "transfer" && payment?.bankAccountId ? String(payment.bankAccountId) : null,
      reference: String(payment?.reference ?? "").trim().slice(0, 60),
    });
  }

  if (!request.customerId) return { message: "Elige el cliente de la venta." };

  const cashReceivedCents = request.cashReceived ? parseMoneyCents(String(request.cashReceived)) : null;
  if (request.cashReceived && cashReceivedCents === null) return { message: "Revisa el efectivo recibido." };

  let saleId: string;
  try {
    const sale = await createSale(tenantId, actor, {
      customerId: String(request.customerId),
      lines: request.lines.map((line) => ({ itemId: String(line?.itemId ?? ""), quantity: Number(line?.quantity) })),
      payments,
      cashReceivedCents,
    });
    saleId = sale.id;
  } catch (error) {
    if (error instanceof CashError || error instanceof InventoryError) return { message: error.message };
    console.error("Error al registrar la venta:", error);
    return { message: "No pudimos registrar la venta. Inténtalo de nuevo." };
  }

  redirect(`/dashboard/cash/sales/${saleId}?registrada=1`);
}

export async function createReturnAction(saleId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize("sales.refund");

  const fields: Record<string, string> = {
    refundMethod: readField(formData, "refundMethod", 20),
    reason: readField(formData, "reason", 300),
  };
  const lines: { saleItemId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty-") || typeof value !== "string") continue;
    fields[key] = value;
    lines.push({ saleItemId: key.slice(4), quantity: /^\d{1,6}$/.test(value) ? Number(value) : 0 });
  }
  const restock = formData.get("restock") === "on";
  const context = { fields, selections: { restock: restock ? ["on"] : [] } };

  const errors: Record<string, string> = {};
  if (!isPaymentMethod(fields.refundMethod)) errors.refundMethod = "Elige cómo se reembolsa.";
  if (!fields.reason) errors.reason = "Escribe el motivo de la devolución.";
  if (!lines.some((line) => line.quantity > 0)) errors.lines = "Indica cuántas piezas se devuelven.";
  if (Object.keys(errors).length > 0) return { ...context, errors };

  let refundTotal: string;
  try {
    const result = await createReturn(tenantId, actor, saleId, {
      lines,
      refundMethod: fields.refundMethod as PaymentInput["method"],
      reason: fields.reason,
      restock,
    });
    refundTotal = result.refundTotal;
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: `Devolución registrada. Reembolso: ${formatMoney(refundTotal)}.` };
}

// ---------------------------------------------------------------------------
// Cuentas bancarias
// ---------------------------------------------------------------------------

export async function createBankAccountAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId } = await authorize("settings.manage");
  const { input, context, errors } = parseBankAccountForm(formData);
  if (errors) return { ...context, errors };

  try {
    await createBankAccount(tenantId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Cuenta agregada." };
}

export async function updateBankAccountAction(
  accountId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenantId } = await authorize("settings.manage");
  const { input, context, errors } = parseBankAccountForm(formData);
  if (errors) return { ...context, errors };

  try {
    await updateBankAccount(tenantId, accountId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Cuenta actualizada." };
}

export async function setBankAccountActiveAction(accountId: string, active: boolean) {
  const { tenantId } = await authorize("settings.manage");
  await setBankAccountActive(tenantId, accountId, active);
  refresh();
}
