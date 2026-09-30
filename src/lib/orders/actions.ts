"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { CashError } from "@/lib/cash/core";
import { parseMoneyCents } from "@/lib/cash/form";
import { computeLine, fromCents, toCents } from "@/lib/cash/money";
import { isPaymentMethod } from "@/lib/cash/labels";
import { parseChargeRequest, type ChargeRequest } from "@/lib/cash/payment-request";
import { isValidDay } from "@/lib/dates";
import { queueOrderEmail, resendTrackingEmail, type OrderEmailContext } from "@/lib/email/order-notifications";
import type { FormState } from "@/lib/form-state";
import { InventoryError } from "@/lib/inventory/core";
import {
  OrderError,
  addFreeLine,
  addOrderPayment,
  addPart,
  cancelOrder,
  changeStatus,
  createOrder,
  deliverOrder,
  releaseOrder,
  removeLine,
  searchOrderOptions,
  searchRepairItems,
  takeOrder,
  updateDiagnosis,
  updateOrder,
} from "@/lib/orders/core";
import { parseIntakeForm, parseOrderForm } from "@/lib/orders/form";
import {
  LABOR_TAX_RATES,
  ORDER_ACCESS_PERMISSIONS,
  canSeeOrderPrices,
  isOrderStatus,
  type OrderOutcome,
} from "@/lib/orders/labels";
import { hasModule, type ModuleKey } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";
import { UUID_PATTERN, readField } from "@/lib/validation";

// Acciones de órdenes de reparación. El taller sale siempre de la sesión y cada acción exige su permiso.

async function authorize(...permissions: Permission[]) {
  const session = await requireAnyTenantPermission(permissions);
  return { session, tenantId: session.tenant.id, actor: { userId: session.user.id, userName: session.user.name } };
}

// Datos para los correos al cliente, que se envían después de guardar.
function emailContext(session: Awaited<ReturnType<typeof authorize>>): OrderEmailContext {
  return {
    tenantId: session.tenantId,
    tenantSlug: session.session.tenant.slug,
    modules: session.session.modules,
    actor: session.actor,
  };
}

function knownMessage(error: unknown) {
  if (error instanceof OrderError || error instanceof CashError || error instanceof InventoryError) return error.message;
  console.error("Error en órdenes:", error);
  return null;
}

// Sin el módulo de Caja los cobros de órdenes se registran sin turno.
function cashOptions(session: { modules: readonly ModuleKey[] }) {
  return { useCashShift: hasModule(session.modules, "cash") };
}

function toErrorState(
  error: unknown,
  context: { fields?: Record<string, string>; selections?: Record<string, string[]> } = {},
): FormState {
  return { ...context, message: knownMessage(error) ?? "No pudimos guardar los cambios. Inténtalo de nuevo." };
}

export type ChargeResult = { message?: string; success?: string };

// ---------------------------------------------------------------------------
// Recepción
// ---------------------------------------------------------------------------

export async function createOrderAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const auth = await authorize("orders.intake");
  const { session, tenantId, actor } = auth;
  const { input, context: orderContext, errors: orderErrors } = parseOrderForm(formData);
  // Sin permiso para cobrar, la orden se registra sin anticipo ni pago del diagnóstico.
  // La refacción se elige del inventario si el taller tiene el módulo; si no, se captura a mano.
  const intakeForm = parseIntakeForm(formData, {
    canCollect: session.permissions.includes("payments.collect"),
    canSeePrices: canSeeOrderPrices(session.permissions),
    hasInventory: hasModule(session.modules, "inventory"),
  });
  const context = { fields: { ...orderContext.fields, ...intakeForm.fields }, selections: intakeForm.selections };
  if (orderErrors || intakeForm.errors) return { ...context, errors: { ...orderErrors, ...intakeForm.errors } };
  if (intakeForm.message) return { ...context, message: intakeForm.message };

  // Sin el módulo de fotos no se ligan enlaces de evidencia.
  const photoSessionIds = !hasModule(session.modules, "photos") ? [] : formData
    .getAll("photoSessionId")
    .filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value))
    .slice(0, 20);

  let orderId: string;
  try {
    orderId = (
      await createOrder(tenantId, actor, input, intakeForm.intake, { photoSessionIds, cash: cashOptions(session) })
    ).id;
  } catch (error) {
    return toErrorState(error, context);
  }

  // El enlace de seguimiento se envía por correo después de responder.
  await queueOrderEmail(emailContext(auth), orderId, "received");
  redirect(`/dashboard/orders/${orderId}?nueva=1`);
}

export async function updateOrderAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId } = await authorize("orders.intake");
  const { input, context, errors } = parseOrderForm(formData);
  if (errors) return { ...context, errors };

  try {
    await updateOrder(tenantId, orderId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  redirect(`/dashboard/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Trabajo del técnico
// ---------------------------------------------------------------------------

export async function takeOrderAction(orderId: string): Promise<FormState> {
  const { session, tenantId, actor } = await authorize("repairs.work");
  try {
    await takeOrder(tenantId, actor, orderId, { allowReassign: session.isOwner });
  } catch (error) {
    return toErrorState(error);
  }
  refresh();
  return { success: "Orden asignada." };
}

export async function updateDiagnosisAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { session, tenantId, actor } = await authorize("repairs.work", "orders.intake");
  const fields = {
    diagnosis: readField(formData, "diagnosis", 2000),
    estimatedCost: readField(formData, "estimatedCost", 20),
    promisedOn: readField(formData, "promisedOn", 10),
  };
  const errors: Record<string, string> = {};
  const estimatedCents = fields.estimatedCost ? parseMoneyCents(fields.estimatedCost) : null;
  if (fields.estimatedCost && estimatedCents === null) errors.estimatedCost = "Usa un importe como 850 o 850.50.";
  if (fields.promisedOn && !isValidDay(fields.promisedOn)) errors.promisedOn = "Fecha no válida.";
  if (Object.keys(errors).length > 0) return { fields, errors };

  try {
    // Recepción puede actualizar el presupuesto de cualquier orden; el técnico, solo las suyas.
    await updateDiagnosis(
      tenantId,
      actor,
      orderId,
      {
        diagnosis: fields.diagnosis,
        // Quien no ve precios no puede cambiar el presupuesto.
        estimatedCents: canSeeOrderPrices(session.permissions) ? estimatedCents : undefined,
        promisedOn: fields.promisedOn || null,
      },
      { override: session.isOwner || session.permissions.includes("orders.intake") },
    );
  } catch (error) {
    return toErrorState(error, { fields });
  }

  refresh();
  return { success: "Diagnóstico guardado." };
}

export async function changeStatusAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const auth = await authorize("repairs.work");
  const { session, tenantId, actor } = auth;
  const fields = {
    status: readField(formData, "status", 30),
    outcome: readField(formData, "outcome", 20),
    note: readField(formData, "note", 500),
  };
  const errors: Record<string, string> = {};
  if (!isOrderStatus(fields.status)) errors.status = "Elige el nuevo estado.";
  if (fields.status === "ready" && fields.outcome !== "repaired" && fields.outcome !== "not_repaired") {
    errors.outcome = "Indica si el equipo quedó reparado.";
  }
  if (Object.keys(errors).length > 0 || !isOrderStatus(fields.status)) return { fields, errors };

  try {
    await changeStatus(
      tenantId,
      actor,
      orderId,
      {
        status: fields.status,
        outcome: fields.status === "ready" ? (fields.outcome as OrderOutcome) : null,
        note: fields.note,
      },
      { override: session.isOwner },
    );
  } catch (error) {
    return toErrorState(error, { fields });
  }

  // Al quedar lista se avisa al cliente por correo (una sola vez por orden), después de responder.
  if (fields.status === "ready") await queueOrderEmail(emailContext(auth), orderId, "ready");
  refresh();
  return { success: "Estado actualizado." };
}

// Reenvía al cliente el enlace de seguimiento por correo.
export async function resendTrackingEmailAction(orderId: string): Promise<FormState> {
  const auth = await authorize("orders.intake");
  const result = await resendTrackingEmail(emailContext(auth), orderId);
  if (!result.sent) return { message: result.reason };
  refresh();
  return { success: `Enviado a ${result.to}.` };
}

export type RepairItemOption = { id: string; name: string; trackStock: boolean; stock: number; price: string | null };

// Sin permiso para ver precios (técnicos) no se envía ningún importe al navegador. Lo usan el
// técnico al agregar refacciones y recepción al elegir la refacción en existencia.
export async function searchRepairItemsAction(query: string): Promise<RepairItemOption[]> {
  const { session, tenantId } = await authorize("repairs.work", "orders.intake");
  if (!hasModule(session.modules, "inventory")) return [];
  const showPrices = canSeeOrderPrices(session.permissions);
  const items = await searchRepairItems(tenantId, typeof query === "string" ? query : "");

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    trackStock: item.trackStock,
    stock: item.stock,
    price: showPrices
      ? fromCents(
          computeLine({
            unitPriceCents: toCents(item.salePrice) + toCents(item.laborPrice),
            quantity: 1,
            taxRate: Number(item.taxRate),
            taxIncluded: item.taxIncluded,
          }).total,
        )
      : null,
  }));
}

export async function addPartAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { session, tenantId, actor } = await authorize("repairs.work");
  const fields = { itemId: readField(formData, "itemId", 36), quantity: readField(formData, "quantity", 6) };
  if (!hasModule(session.modules, "inventory")) {
    return { fields, message: "El inventario no está activo; captura la refacción a mano." };
  }
  const errors: Record<string, string> = {};
  if (!fields.itemId) errors.itemId = "Busca y elige la refacción.";
  if (!/^\d{1,4}$/.test(fields.quantity) || Number(fields.quantity) < 1 || Number(fields.quantity) > 1000) {
    errors.quantity = "Escribe una cantidad entre 1 y 1000.";
  }
  if (Object.keys(errors).length > 0) return { fields, errors };

  try {
    await addPart(
      tenantId,
      actor,
      orderId,
      { itemId: fields.itemId, quantity: Number(fields.quantity) },
      { override: session.isOwner },
    );
  } catch (error) {
    return toErrorState(error, { fields });
  }

  refresh();
  return { success: "Refacción agregada." };
}

export async function addLaborAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  // La mano de obra suelta la captura quien maneja los cobros, no el técnico.
  const { tenantId, actor } = await authorize("orders.prices", "payments.collect");
  const fields = {
    description: readField(formData, "description", 150),
    price: readField(formData, "price", 20),
    taxRate: readField(formData, "taxRate", 3),
  };
  const taxIncluded = formData.get("taxIncluded") === "on";
  const context = { fields, selections: { taxIncluded: taxIncluded ? ["on"] : [] } };
  const errors: Record<string, string> = {};
  if (!fields.description) errors.description = "Describe el trabajo, por ejemplo “Cambio de pantalla”.";
  const priceCents = parseMoneyCents(fields.price);
  if (priceCents === null) errors.price = "Usa un importe como 350 o 350.50.";
  if (!LABOR_TAX_RATES.includes(fields.taxRate)) errors.taxRate = "Elige el IVA.";
  if (Object.keys(errors).length > 0) return { ...context, errors };

  try {
    await addFreeLine(
      tenantId,
      actor,
      orderId,
      "labor",
      {
        description: fields.description,
        quantity: 1,
        priceCents: priceCents ?? 0,
        taxRate: Number(fields.taxRate),
        taxIncluded,
      },
      { override: true },
    );
  } catch (error) {
    return { ...context, message: knownMessage(error) ?? "No pudimos guardar los cambios. Inténtalo de nuevo." };
  }

  refresh();
  return { success: "Mano de obra agregada." };
}

// Refacción capturada a mano, para talleres sin el módulo de Inventario. La agrega el técnico
// de la orden; quien no ve precios la registra sin importe.
export async function addFreePartAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { session, tenantId, actor } = await authorize("repairs.work");
  const showPrices = canSeeOrderPrices(session.permissions);
  const fields = {
    description: readField(formData, "description", 150),
    quantity: readField(formData, "quantity", 6),
    price: showPrices ? readField(formData, "price", 20) : "",
    taxRate: showPrices ? readField(formData, "taxRate", 3) : "16",
  };
  const taxIncluded = showPrices ? formData.get("taxIncluded") === "on" : true;
  const context = { fields, selections: { taxIncluded: taxIncluded ? ["on"] : [] } };
  const errors: Record<string, string> = {};
  if (!fields.description) errors.description = "Describe la refacción, por ejemplo “Pantalla iPhone 11”.";
  if (!/^\d{1,4}$/.test(fields.quantity) || Number(fields.quantity) < 1 || Number(fields.quantity) > 1000) {
    errors.quantity = "Escribe una cantidad entre 1 y 1000.";
  }
  const priceCents = showPrices ? parseMoneyCents(fields.price) : 0;
  if (priceCents === null) errors.price = "Usa un importe como 350 o 350.50.";
  if (!LABOR_TAX_RATES.includes(fields.taxRate)) errors.taxRate = "Elige el IVA.";
  if (Object.keys(errors).length > 0) return { ...context, errors };

  try {
    await addFreeLine(
      tenantId,
      actor,
      orderId,
      "part",
      {
        description: fields.description,
        quantity: Number(fields.quantity),
        priceCents: priceCents ?? 0,
        taxRate: Number(fields.taxRate),
        taxIncluded,
      },
      { override: session.isOwner },
    );
  } catch (error) {
    return { ...context, message: knownMessage(error) ?? "No pudimos guardar los cambios. Inténtalo de nuevo." };
  }

  refresh();
  return { success: "Refacción agregada." };
}

export async function removeLineAction(orderId: string, lineId: string): Promise<FormState> {
  const { session, tenantId, actor } = await authorize(
    "repairs.work",
    "orders.prices",
    "payments.collect",
    "orders.intake",
  );
  try {
    await removeLine(tenantId, actor, orderId, lineId, {
      override: session.isOwner,
      allowLabor: canSeeOrderPrices(session.permissions),
      allowIntakeFix: session.permissions.includes("orders.intake"),
    });
  } catch (error) {
    return toErrorState(error);
  }
  refresh();
  return { success: "Renglón quitado." };
}

export async function releaseOrderAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { session, tenantId, actor } = await authorize("repairs.work");
  const fields = { reason: readField(formData, "reason", 400) };
  if (!fields.reason) return { fields, errors: { reason: "Escribe por qué la devuelves." } };

  try {
    await releaseOrder(tenantId, actor, orderId, { reason: fields.reason }, { override: session.isOwner });
  } catch (error) {
    return toErrorState(error, { fields });
  }

  refresh();
  return { success: "Orden devuelta a la cola." };
}

// ---------------------------------------------------------------------------
// Cobros, entrega y cancelación
// ---------------------------------------------------------------------------

export async function addOrderPaymentAction(orderId: string, request: ChargeRequest): Promise<ChargeResult> {
  const { session, tenantId, actor } = await authorize("payments.collect");
  const parsed = parseChargeRequest(request);
  if ("message" in parsed) return parsed;

  try {
    await addOrderPayment(tenantId, actor, orderId, parsed, cashOptions(session));
  } catch (error) {
    return { message: knownMessage(error) ?? "No pudimos registrar el cobro. Inténtalo de nuevo." };
  }

  refresh();
  return { success: "Cobro registrado." };
}

// `expectedTotal`: total de la orden que mostró la página (se liga al renderizarla).
export async function deliverOrderAction(
  orderId: string,
  expectedTotal: string,
  request: ChargeRequest & { refundMethod: string | null; warrantyId: string | null },
): Promise<ChargeResult> {
  const { session, tenantId, actor } = await authorize("orders.deliver");
  const parsed = parseChargeRequest(request);
  if ("message" in parsed) return parsed;
  const expectedTotalCents = parseMoneyCents(String(expectedTotal ?? ""));

  // Que la garantía exista y esté activa se verifica al entregar, dentro de la transacción.
  const warrantyId = request?.warrantyId ? String(request.warrantyId) : null;
  if (warrantyId !== null && !UUID_PATTERN.test(warrantyId)) return { message: "Garantía no válida." };

  const refundMethod = request?.refundMethod ? String(request.refundMethod) : null;
  if (refundMethod !== null && !isPaymentMethod(refundMethod)) return { message: "Método de reembolso no válido." };
  if ((parsed.payments.length > 0 || refundMethod) && !session.permissions.includes("payments.collect")) {
    return { message: "No tienes permiso para cobrar reparaciones." };
  }

  try {
    await deliverOrder(tenantId, actor, orderId, { ...parsed, refundMethod, expectedTotalCents, warrantyId }, cashOptions(session));
  } catch (error) {
    return { message: knownMessage(error) ?? "No pudimos entregar la orden. Inténtalo de nuevo." };
  }

  redirect(`/dashboard/orders/${orderId}?entregada=1`);
}

export async function cancelOrderAction(orderId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { session, tenantId, actor } = await authorize("orders.intake");
  const fields = { reason: readField(formData, "reason", 300), refundMethod: readField(formData, "refundMethod", 20) };
  if (!fields.reason) return { fields, errors: { reason: "Escribe el motivo de la cancelación." } };

  const refundMethod = fields.refundMethod && isPaymentMethod(fields.refundMethod) ? fields.refundMethod : null;
  if (refundMethod && !session.permissions.includes("payments.collect")) {
    return { fields, message: "No tienes permiso para reembolsar cobros." };
  }

  try {
    await cancelOrder(tenantId, actor, orderId, { reason: fields.reason, refundMethod }, cashOptions(session));
  } catch (error) {
    return toErrorState(error, { fields });
  }

  redirect(`/dashboard/orders/${orderId}`);
}

// Para ligar compras de refacciones a una orden.
export async function searchOrdersAction(query: string) {
  const { tenantId } = await authorize("purchases.manage", ...ORDER_ACCESS_PERMISSIONS);
  return searchOrderOptions(tenantId, typeof query === "string" ? query : "");
}
