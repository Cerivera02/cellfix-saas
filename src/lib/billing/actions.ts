"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { BILLING_PATH, canManageBilling, requireTenantSession } from "@/lib/auth/session";
import {
  BillingError,
  createCheckoutUrl,
  createPortalUrl,
  getBilledModules,
  updateSubscriptionModules,
} from "@/lib/billing/subscription";
import type { FormState } from "@/lib/form-state";
import { MODULES, MODULE_KEYS, isModuleKey, type ModuleKey } from "@/lib/modules";
import { publicBaseUrl } from "@/lib/public-url";

// URL base para las direcciones de regreso de Stripe. En producción exige APP_URL: no se arma
// con encabezados de la petición, que el cliente puede alterar.
async function billingBaseUrl() {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    console.error("Falta APP_URL: no se pueden armar las direcciones de regreso de Stripe.");
    throw new BillingError("Los pagos no están disponibles por un problema de configuración. Escríbenos.");
  }
  return publicBaseUrl();
}

// Estas acciones funcionan aunque el taller esté bloqueado: son la forma de desbloquearlo.
// Solo el propietario (o quien administra la configuración) puede usarlas.
async function requireBillingManager() {
  const session = await requireTenantSession({ allowLocked: true });
  return canManageBilling(session) ? session : null;
}

function readModules(formData: FormData): { modules: ModuleKey[]; error?: string } {
  const selected = formData
    .getAll("modules")
    .filter((value): value is ModuleKey => typeof value === "string" && isModuleKey(value));
  const modules = MODULE_KEYS.filter((key) => selected.includes(key));
  const missing = modules.find((key) => MODULES[key].requires.some((required) => !modules.includes(required)));
  if (missing) {
    const required = MODULES[missing].requires.map((key) => MODULES[key].label).join(" y ");
    return { modules, error: `${MODULES[missing].label} requiere ${required}.` };
  }
  return { modules };
}

function billingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BillingError) return error.message;
  console.error(fallback, error);
  return fallback;
}

export async function startCheckoutAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireBillingManager();
  if (!session) return { message: "Solo el propietario del taller puede elegir el plan." };

  const { modules, error } = readModules(formData);
  if (error) return { message: error, selections: { modules } };

  let url: string;
  try {
    url = await createCheckoutUrl({
      tenantId: session.tenant.id,
      email: session.user.email,
      modules,
      baseUrl: await billingBaseUrl(),
    });
  } catch (error) {
    return { message: billingErrorMessage(error, "No pudimos abrir la página de pago. Inténtalo de nuevo."), selections: { modules } };
  }

  redirect(url);
}

export async function updateModulesAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireBillingManager();
  if (!session) return { message: "Solo el propietario del taller puede cambiar el plan." };

  const { modules, error } = readModules(formData);
  if (error) return { message: error, selections: { modules } };

  try {
    // Con un pago pendiente solo se pueden quitar módulos, no agregar.
    if (session.access.state !== "active" && session.access.state !== "trial") {
      const billed = await getBilledModules(session.tenant.id);
      if (modules.some((key) => !billed.includes(key))) {
        return {
          message: "Mientras haya un pago pendiente solo puedes quitar módulos. Actualiza tu pago para agregar más.",
          selections: { modules },
        };
      }
    }
    await updateSubscriptionModules(session.tenant.id, modules);
  } catch (error) {
    return { message: billingErrorMessage(error, "No pudimos cambiar tu plan. Inténtalo de nuevo."), selections: { modules } };
  }

  refresh();
  return { success: "Plan actualizado. La diferencia se verá en tu próxima factura.", selections: { modules } };
}

export async function openBillingPortalAction(): Promise<FormState> {
  const session = await requireBillingManager();
  if (!session) return { message: "Solo el propietario del taller puede administrar el pago." };

  let url: string;
  try {
    url = await createPortalUrl(session.tenant.id, `${await billingBaseUrl()}${BILLING_PATH}`);
  } catch (error) {
    return { message: billingErrorMessage(error, "No pudimos abrir el portal de pagos. Inténtalo de nuevo.") };
  }

  redirect(url);
}
