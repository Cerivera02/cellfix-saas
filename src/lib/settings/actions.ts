"use server";

import { refresh } from "next/cache";
import { requireTenantPermission } from "@/lib/auth/session";
import { parseMoneyCents } from "@/lib/cash/form";
import { fromCents } from "@/lib/cash/money";
import { isValidRfc, normalizeRfc } from "@/lib/customers/sat";
import type { FormState } from "@/lib/form-state";
import { hasModule } from "@/lib/modules";
import { syncOpenOrdersDiagnosis } from "@/lib/orders/core";
import { getTicketSettings, updateRepairSettings, updateTicketSettings } from "@/lib/settings/core";
import { TICKET_LIMITS, isPaperWidth } from "@/lib/settings/ticket";
import { readField } from "@/lib/validation";
import {
  WARRANTY_DAYS_MAX,
  WARRANTY_NAME_MAX,
  WarrantyError,
  createWarranty,
  setWarrantyActive,
  updateWarranty,
} from "@/lib/warranties/core";

// Configuración del taller. Solo quien tiene "Configuración del taller".

const TEXT_FIELDS = Object.keys(TICKET_LIMITS) as (keyof typeof TICKET_LIMITS)[];

export async function updateTicketSettingsAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantPermission("settings.manage");

  const fields = {} as Record<keyof typeof TICKET_LIMITS, string>;
  const errors: Record<string, string> = {};
  for (const key of TEXT_FIELDS) {
    // Un carácter de más para detectar textos demasiado largos en vez de recortarlos.
    fields[key] = readField(formData, key, TICKET_LIMITS[key] + 1);
    if (fields[key].length > TICKET_LIMITS[key]) errors[key] = `Usa como máximo ${TICKET_LIMITS[key]} caracteres.`;
  }

  fields.taxId = normalizeRfc(fields.taxId);
  if (fields.taxId && !errors.taxId && !isValidRfc(fields.taxId)) {
    errors.taxId = "Escribe un RFC válido: 12 caracteres para persona moral o 13 para persona física.";
  }

  const paperWidth = readField(formData, "paperWidth", 2);
  if (!isPaperWidth(paperWidth)) errors.paperWidth = "Elige el ancho del papel.";

  const showCustomerPhone = formData.get("showCustomerPhone") === "on";
  const context = {
    fields: { ...fields, paperWidth, showCustomerPhone: showCustomerPhone ? "on" : "" },
  };
  if (Object.keys(errors).length > 0 || !isPaperWidth(paperWidth)) return { ...context, errors };

  try {
    // Con el módulo de seguimiento apagado la casilla no se muestra: se conserva lo guardado.
    const showTrackingQr = hasModule(session.modules, "tracking")
      ? formData.get("showTrackingQr") === "on"
      : (await getTicketSettings(session.tenant.id)).showTrackingQr;

    await updateTicketSettings(session.tenant.id, {
      ...fields,
      paperWidth,
      showCustomerPhone,
      showTrackingQr,
    });
  } catch (error) {
    console.error("Error al guardar la configuración del ticket:", error);
    return { ...context, message: "No pudimos guardar la configuración. Inténtalo de nuevo." };
  }

  refresh();
  return { success: "Configuración guardada." };
}

// Configuración de las órdenes: costo sugerido del diagnóstico y si se descuenta de la reparación.
export async function updateRepairSettingsAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantPermission("settings.manage");

  const diagnosisFee = readField(formData, "diagnosisFee", 20);
  const diagnosisCredit = formData.get("diagnosisCredit") === "on";
  const context = { fields: { diagnosisFee, diagnosisCredit: diagnosisCredit ? "on" : "" } };

  const feeCents = diagnosisFee ? parseMoneyCents(diagnosisFee) : 0;
  if (feeCents === null) return { ...context, errors: { diagnosisFee: "Usa un importe como 150 o 150.50 (0 si es gratis)." } };

  try {
    // Las órdenes abiertas con diagnóstico cobrado se ajustan a la nueva regla en la misma transacción.
    const actor = { userId: session.user.id, userName: session.user.name };
    await updateRepairSettings(session.tenant.id, { diagnosisFee: fromCents(feeCents), diagnosisCredit }, (client) =>
      syncOpenOrdersDiagnosis(client, actor),
    );
  } catch (error) {
    console.error("Error al guardar la configuración de órdenes:", error);
    return { ...context, message: "No pudimos guardar la configuración. Inténtalo de nuevo." };
  }

  refresh();
  return { success: "Configuración guardada." };
}

// ---------------------------------------------------------------------------
// Catálogo de garantías
// ---------------------------------------------------------------------------

function parseWarrantyForm(formData: FormData) {
  const fields = {
    name: readField(formData, "name", WARRANTY_NAME_MAX + 1),
    days: readField(formData, "days", 5),
  };
  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Escribe el nombre de la garantía.";
  else if (fields.name.length > WARRANTY_NAME_MAX) errors.name = `Usa como máximo ${WARRANTY_NAME_MAX} caracteres.`;

  const days = Number(fields.days);
  if (!/^\d+$/.test(fields.days) || days > WARRANTY_DAYS_MAX) {
    errors.days = `Escribe de 0 a ${WARRANTY_DAYS_MAX} días.`;
  }

  const context = { fields };
  if (Object.keys(errors).length > 0) return { context, errors } as const;
  return { context, input: { name: fields.name, days } } as const;
}

function warrantyErrorState(error: unknown, context: FormState): FormState {
  if (error instanceof WarrantyError) return { ...context, message: error.message };
  console.error("Error al guardar la garantía:", error);
  return { ...context, message: "No pudimos guardar la garantía. Inténtalo de nuevo." };
}

export async function createWarrantyAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireTenantPermission("settings.manage");
  const parsed = parseWarrantyForm(formData);
  if (!parsed.input) return { ...parsed.context, errors: parsed.errors };

  try {
    await createWarranty(session.tenant.id, parsed.input);
  } catch (error) {
    return warrantyErrorState(error, parsed.context);
  }

  refresh();
  return { success: "Garantía agregada." };
}

export async function updateWarrantyAction(
  warrantyId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireTenantPermission("settings.manage");
  const parsed = parseWarrantyForm(formData);
  if (!parsed.input) return { ...parsed.context, errors: parsed.errors };

  try {
    await updateWarranty(session.tenant.id, warrantyId, parsed.input);
  } catch (error) {
    return warrantyErrorState(error, parsed.context);
  }

  refresh();
  return { success: "Garantía actualizada." };
}

export async function setWarrantyActiveAction(warrantyId: string, active: boolean) {
  const session = await requireTenantPermission("settings.manage");
  await setWarrantyActive(session.tenant.id, warrantyId, active === true);
  refresh();
}
