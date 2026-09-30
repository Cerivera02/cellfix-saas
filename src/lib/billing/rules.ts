// Reglas de cobro sin dependencias de servidor: las usan las acciones y la página de suscripción.
import { MODULES, MODULE_KEYS, isModuleKey, type ModuleKey } from "@/lib/modules";

// Cargo mínimo de Stripe por moneda, en centavos (https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts).
// Monedas no listadas: no se bloquea aquí y Stripe decide.
const STRIPE_MINIMUM_CENTS: Record<string, number> = {
  mxn: 1000,
  usd: 50,
  eur: 50,
  cad: 50,
  gbp: 30,
  brl: 50,
  cop: 200000,
  clp: 50000,
};

export function minimumChargeCents(currency: string) {
  return STRIPE_MINIMUM_CENTS[currency.toLowerCase()] ?? 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Stripe Checkout exige que trial_end quede al menos 48 horas en el futuro; se deja margen
// por el tiempo que el usuario tarde en la página de pago.
const CHECKOUT_TRIAL_END_MIN_MS = 48 * 60 * 60 * 1000 + 60 * 60 * 1000;

export type CheckoutTrial = {
  // Uno de los dos va a Stripe: fecha exacta de fin o número de días.
  trialEnd?: number;
  trialPeriodDays?: number;
  // Cuándo será el primer cobro (aproximado si se usan días).
  firstChargeAt: Date;
};

// Si al taller le quedan días de prueba, el checkout los respeta: el primer cobro es al terminar
// la prueba, nunca antes. Con 49 horas o más se usa la fecha exacta; con menos, los días
// redondeados hacia arriba (mínimo 1), así que el cobro cae el mismo día o poco después.
// Sin prueba vigente (gracia, bloqueo, cancelada) no hay prueba y se cobra de inmediato.
export function checkoutTrial(
  subscription: { status: string; trialEndsAt: Date | null },
  now = new Date(),
): CheckoutTrial | null {
  if (subscription.status !== "trialing" || !subscription.trialEndsAt) return null;
  const remaining = subscription.trialEndsAt.getTime() - now.getTime();
  if (remaining <= 0) return null;
  if (remaining >= CHECKOUT_TRIAL_END_MIN_MS) {
    return { trialEnd: Math.floor(subscription.trialEndsAt.getTime() / 1000), firstChargeAt: subscription.trialEndsAt };
  }
  const days = Math.max(1, Math.ceil(remaining / DAY_MS));
  return { trialPeriodDays: days, firstChargeAt: new Date(now.getTime() + days * DAY_MS) };
}

// Valida los módulos que llegan de un formulario: rechaza claves desconocidas y módulos cuyo
// requisito no se eligió (Compras sin Inventario). Devuelve la lista en orden canónico.
export function parseModuleSelection(values: readonly unknown[]): { modules: ModuleKey[]; error?: string } {
  const strings = values.filter((value): value is string => typeof value === "string");
  if (strings.length !== values.length || strings.some((value) => !isModuleKey(value))) {
    return { modules: [], error: "Elegiste un módulo que no existe. Recarga la página e inténtalo de nuevo." };
  }
  const modules = MODULE_KEYS.filter((key) => strings.includes(key));
  const missing = modules.find((key) => MODULES[key].requires.some((required) => !modules.includes(required)));
  if (missing) {
    const required = MODULES[missing].requires.map((key) => MODULES[key].label).join(" y ");
    return { modules, error: `${MODULES[missing].label} requiere ${required}.` };
  }
  return { modules };
}
