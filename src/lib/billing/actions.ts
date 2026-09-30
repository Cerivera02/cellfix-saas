"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { BILLING_PATH, canManageBilling, requireTenantSession } from "@/lib/auth/session";
import { parseModuleSelection } from "@/lib/billing/rules";
import {
  BillingError,
  createCheckoutUrl,
  createPortalUrl,
  getBilledModules,
  logStripeError,
  previewModuleChange,
  updateSubscriptionModules,
  type ModuleChangePreview,
} from "@/lib/billing/subscription";
import type { FormState } from "@/lib/form-state";
import type { ModuleKey } from "@/lib/modules";
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

function readModules(formData: FormData) {
  return parseModuleSelection(formData.getAll("modules"));
}

// Mensaje para el usuario: los BillingError ya vienen en español y sin datos internos; los errores
// de Stripe se registran con sus ids y se muestra un mensaje general.
function billingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BillingError) return error.message;
  if (error instanceof Stripe.errors.StripeCardError) {
    logStripeError(fallback, error);
    return "Tu tarjeta fue rechazada. Revisa los datos o usa otra tarjeta desde Administrar pago.";
  }
  if (error instanceof Stripe.errors.StripeRateLimitError || error instanceof Stripe.errors.StripeConnectionError) {
    logStripeError(fallback, error);
    return "Stripe no respondió a tiempo. Espera un momento e inténtalo de nuevo.";
  }
  logStripeError(fallback, error);
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

export type ModuleChangeState =
  | {
      message?: string;
      success?: string;
      preview?: ModuleChangePreview;
    }
  | undefined;

type BillingManager = NonNullable<Awaited<ReturnType<typeof requireBillingManager>>>;

// Con un pago pendiente (o el acceso pausado) solo se pueden quitar módulos, no agregar.
async function additionsBlocked(session: BillingManager, modules: ModuleKey[]) {
  if (session.access.state === "active" || session.access.state === "trial") return false;
  const billed = await getBilledModules(session.tenant.id);
  return modules.some((key) => !billed.includes(key));
}

const ADDITIONS_BLOCKED_MESSAGE =
  "Mientras haya un pago pendiente solo puedes quitar módulos. Actualiza tu pago para agregar más.";

// Paso 1 del cambio de módulos: muestra cuánto se ajusta la próxima factura antes de confirmar.
export async function previewModulesAction(_prevState: ModuleChangeState, formData: FormData): Promise<ModuleChangeState> {
  const session = await requireBillingManager();
  if (!session) return { message: "Solo el propietario del taller puede cambiar el plan." };

  const { modules, error } = readModules(formData);
  if (error) return { message: error };

  try {
    if (await additionsBlocked(session, modules)) return { message: ADDITIONS_BLOCKED_MESSAGE };
    return { preview: await previewModuleChange(session.tenant.id, modules) };
  } catch (error) {
    return { message: billingErrorMessage(error, "No pudimos calcular el cambio. Inténtalo de nuevo.") };
  }
}

// Paso 2: aplica el cambio con la misma fecha de prorrateo que se mostró.
export async function updateModulesAction(_prevState: ModuleChangeState, formData: FormData): Promise<ModuleChangeState> {
  const session = await requireBillingManager();
  if (!session) return { message: "Solo el propietario del taller puede cambiar el plan." };

  const { modules, error } = readModules(formData);
  if (error) return { message: error };
  const rawDate = formData.get("prorationDate");
  const prorationDate = typeof rawDate === "string" && /^\d{9,11}$/.test(rawDate) ? Number(rawDate) : undefined;

  try {
    if (await additionsBlocked(session, modules)) return { message: ADDITIONS_BLOCKED_MESSAGE };
    await updateSubscriptionModules(session.tenant.id, modules, prorationDate);
  } catch (error) {
    return { message: billingErrorMessage(error, "No pudimos cambiar tu plan. Inténtalo de nuevo.") };
  }

  refresh();
  return { success: "Plan actualizado. El ajuste aparecerá en tu próxima factura." };
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
