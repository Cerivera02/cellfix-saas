"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { updatePricing } from "@/lib/admin/pricing";
import { backfillTenantPayments } from "@/lib/billing/payments";
import { UUID_PATTERN } from "@/lib/validation";
import {
  createTenant,
  extendTenantTrial,
  markTenantActive,
  setTenantModules,
  setTenantStatus,
  updateTenantName,
  type TenantStatus,
} from "@/lib/admin/tenants";
import { parseMoneyCents } from "@/lib/cash/form";
import type { FormState } from "@/lib/form-state";
import { MODULES, MODULE_KEYS, isModuleKey, type ModuleKey } from "@/lib/modules";
import { EmailTakenError, PLATFORM_ACTOR } from "@/lib/team/core";
import {
  addMemberFromForm,
  createCustomRoleFromForm,
  deleteCustomRoleFromForm,
  removeMemberFromForm,
  setMemberPasswordFromForm,
  updateCustomRoleFromForm,
  updateMemberRolesFromForm,
} from "@/lib/team/operations";
import { EMAIL_PATTERN, getPasswordError, readField, readPassword } from "@/lib/validation";

// Cada acción verifica al administrador antes de cualquier try/catch,
// para que la redirección a /login no quede atrapada como un error.

export async function createTenantAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();

  const fields = {
    name: readField(formData, "name", 150),
    ownerName: readField(formData, "ownerName", 100),
    ownerEmail: readField(formData, "ownerEmail", 200).toLowerCase(),
  };
  const password = readPassword(formData, "ownerPassword");

  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Escribe el nombre del taller.";
  if (!fields.ownerName) errors.ownerName = "Escribe el nombre del propietario.";
  if (!EMAIL_PATTERN.test(fields.ownerEmail)) errors.ownerEmail = "Escribe un correo válido.";
  const passwordError = getPasswordError(password);
  if (passwordError) errors.ownerPassword = passwordError;

  if (Object.keys(errors).length > 0) {
    return { errors, fields };
  }

  let tenantId: string;
  try {
    tenantId = await createTenant(fields.name, { name: fields.ownerName, email: fields.ownerEmail, password });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { errors: { ownerEmail: error.message }, fields };
    }
    console.error("Error al crear el taller:", error);
    return { message: "No pudimos crear el taller. Inténtalo de nuevo.", fields };
  }

  redirect(`/admin/tenants/${tenantId}`);
}

export async function updateTenantNameAction(
  tenantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();

  const name = readField(formData, "name", 150);
  if (!name) {
    return { errors: { name: "Escribe el nombre del taller." }, fields: { name } };
  }

  try {
    await updateTenantName(tenantId, name);
  } catch (error) {
    console.error("Error al actualizar el taller:", error);
    return { message: "No pudimos guardar los cambios.", fields: { name } };
  }

  refresh();
  return { success: "Nombre actualizado." };
}

export async function setTenantStatusAction(tenantId: string, status: TenantStatus) {
  await requirePlatformAdmin();
  if (status !== "active" && status !== "suspended") return;

  await setTenantStatus(tenantId, status);
  refresh();
}

export async function setTenantModulesAction(
  tenantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();

  const selected = formData.getAll("modules").filter((value): value is string => typeof value === "string" && isModuleKey(value));
  const selections = { modules: selected };

  // Un módulo con requisitos (Compras necesita Inventario) no se activa solo.
  const missing = MODULE_KEYS.find(
    (key) => selected.includes(key) && MODULES[key].requires.some((required) => !selected.includes(required)),
  );
  if (missing) {
    const required = MODULES[missing].requires.map((key) => MODULES[key].label).join(" y ");
    return { selections, message: `${MODULES[missing].label} requiere ${required}.` };
  }

  try {
    await setTenantModules(tenantId, selected);
  } catch (error) {
    console.error("Error al actualizar los módulos del taller:", error);
    return { selections, message: "No pudimos guardar los módulos." };
  }

  refresh();
  return { success: "Módulos actualizados." };
}

export async function addMemberAction(tenantId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  return addMemberFromForm(PLATFORM_ACTOR, tenantId, formData);
}

export async function updateMemberRolesAction(
  tenantId: string,
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return updateMemberRolesFromForm(PLATFORM_ACTOR, tenantId, userId, formData);
}

export async function removeMemberAction(tenantId: string, userId: string): Promise<FormState> {
  await requirePlatformAdmin();
  return removeMemberFromForm(PLATFORM_ACTOR, tenantId, userId);
}

export async function setMemberPasswordAction(
  tenantId: string,
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return setMemberPasswordFromForm(PLATFORM_ACTOR, tenantId, userId, formData);
}

export async function createCustomRoleAction(
  tenantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return createCustomRoleFromForm(PLATFORM_ACTOR, tenantId, formData);
}

export async function updateCustomRoleAction(
  tenantId: string,
  roleId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return updateCustomRoleFromForm(PLATFORM_ACTOR, tenantId, roleId, formData);
}

export async function deleteCustomRoleAction(tenantId: string, roleId: string): Promise<FormState> {
  await requirePlatformAdmin();
  return deleteCustomRoleFromForm(PLATFORM_ACTOR, tenantId, roleId);
}

function readInteger(formData: FormData, key: string) {
  const raw = readField(formData, key, 10);
  return /^\d{1,4}$/.test(raw) ? Number(raw) : null;
}

// Tope por concepto: Stripe no acepta importes de más de 8 dígitos en centavos.
const MAX_PRICE_CENTS = 100_000_00;

export async function updatePricingAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();

  const fields: Record<string, string> = {
    trialDays: readField(formData, "trialDays", 10),
    graceDays: readField(formData, "graceDays", 10),
    basePrice: readField(formData, "basePrice", 20),
  };
  for (const key of MODULE_KEYS) fields[`price_${key}`] = readField(formData, `price_${key}`, 20);

  const errors: Record<string, string> = {};
  const trialDays = readInteger(formData, "trialDays");
  if (trialDays === null || trialDays < 1 || trialDays > 365) errors.trialDays = "Usa un número de 1 a 365.";
  const graceDays = readInteger(formData, "graceDays");
  if (graceDays === null || graceDays > 90) errors.graceDays = "Usa un número de 0 a 90.";

  const readPrice = (key: string) => {
    const cents = parseMoneyCents(fields[key]);
    if (cents === null || cents > MAX_PRICE_CENTS) {
      errors[key] = "Escribe un importe válido, p. ej. 149.00.";
      return 0;
    }
    return cents;
  };
  const baseCents = readPrice("basePrice");
  const moduleCents = Object.fromEntries(MODULE_KEYS.map((key) => [key, readPrice(`price_${key}`)])) as Record<
    ModuleKey,
    number
  >;

  if (Object.keys(errors).length > 0 || trialDays === null || graceDays === null) {
    return { errors, fields };
  }

  try {
    await updatePricing({ trialDays, graceDays, baseCents, moduleCents });
  } catch (error) {
    console.error("Error al guardar los precios:", error);
    return { message: "No pudimos guardar los precios.", fields };
  }

  refresh();
  return { success: "Precios guardados.", fields };
}

export async function extendTrialAction(tenantId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();

  const days = readInteger(formData, "days");
  const fields = { days: readField(formData, "days", 10) };
  if (days === null || days < 1 || days > 365) {
    return { errors: { days: "Usa un número de 1 a 365." }, fields };
  }

  try {
    const extended = await extendTenantTrial(tenantId, days);
    if (!extended) {
      return { message: "Este taller ya paga con Stripe; su acceso lo controla la suscripción.", fields };
    }
  } catch (error) {
    console.error("Error al extender la prueba:", error);
    return { message: "No pudimos extender la prueba.", fields };
  }

  refresh();
  return { success: days === 1 ? "Prueba extendida 1 día." : `Prueba extendida ${days} días.` };
}

export async function markTenantActiveAction(tenantId: string): Promise<FormState> {
  await requirePlatformAdmin();

  try {
    await markTenantActive(tenantId);
  } catch (error) {
    console.error("Error al activar la suscripción:", error);
    return { message: "No pudimos activar la suscripción." };
  }

  refresh();
  return undefined;
}

// Trae de Stripe las facturas del taller y actualiza su historial de pagos.
export async function syncTenantPaymentsAction(tenantId: string): Promise<FormState> {
  await requirePlatformAdmin();
  if (!UUID_PATTERN.test(tenantId)) return { message: "Taller no válido." };

  try {
    const fetched = await backfillTenantPayments(tenantId);
    if (fetched === null) return { message: "Sin Stripe configurado o sin cliente de Stripe para este taller." };
  } catch (error) {
    console.error("Error al sincronizar los pagos:", error);
    return { message: "No pudimos traer los pagos de Stripe." };
  }

  refresh();
  return undefined;
}
