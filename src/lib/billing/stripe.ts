import "server-only";
import Stripe from "stripe";
import type { ModuleKey } from "@/lib/modules";

const globalForStripe = globalThis as typeof globalThis & { cellfixStripe?: Stripe };

// Cliente de Stripe, o null si falta STRIPE_SECRET_KEY (la página de suscripción lo avisa).
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  globalForStripe.cellfixStripe ??= new Stripe(key, { appInfo: { name: "CellFix" } });
  return globalForStripe.cellfixStripe;
}

// La llave define el modo: sk_live_/rk_live_ = producción; cualquier otra = modo de prueba.
export function isStripeLiveMode() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

// Cada concepto del plan es un producto de Stripe con id fijo. Los precios van con price_data
// en cada checkout o cambio, así el precio lo decide siempre el panel administrativo.
export const BASE_PRODUCT_ID = "cellfix_base";
const MODULE_PRODUCT_PREFIX = "cellfix_module_";

export function moduleProductId(key: ModuleKey) {
  return `${MODULE_PRODUCT_PREFIX}${key}`;
}

// Módulo al que corresponde un producto; null para la base o productos ajenos.
export function moduleFromProductId(productId: string) {
  return productId.startsWith(MODULE_PRODUCT_PREFIX) ? productId.slice(MODULE_PRODUCT_PREFIX.length) : null;
}

const knownProducts = new Set<string>();

// Crea el producto la primera vez que se necesita (en modo de prueba y en producción por separado).
export async function ensureProduct(stripe: Stripe, id: string, name: string) {
  if (knownProducts.has(id)) return;
  try {
    await stripe.products.retrieve(id);
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== "resource_missing") throw error;
    try {
      await stripe.products.create({ id, name });
    } catch (createError) {
      // Otra petición lo creó al mismo tiempo.
      if (!(createError instanceof Stripe.errors.StripeInvalidRequestError) || createError.code !== "resource_already_exists") {
        throw createError;
      }
    }
  }
  knownProducts.add(id);
}
