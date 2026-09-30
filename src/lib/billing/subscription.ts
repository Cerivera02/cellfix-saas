import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import type { SubscriptionStatus } from "@/lib/billing/access";
import { syncInvoiceById } from "@/lib/billing/payments";
import { getPublicPricing } from "@/lib/billing/pricing";
import { BASE_PRODUCT_ID, ensureProduct, getStripe, moduleFromProductId, moduleProductId } from "@/lib/billing/stripe";
import { MODULES, MODULE_KEYS, normalizeModules, type ModuleKey } from "@/lib/modules";
import { UUID_PATTERN } from "@/lib/validation";

// Suscripción de un taller con Stripe. Los módulos y el estado del taller solo se escriben
// con datos que vienen de Stripe (webhook o respuesta de su API), nunca del formulario.
// Cada taller tiene un solo cliente de Stripe y a lo más una suscripción vigente.

export class BillingError extends Error {}

type TenantBillingRow = {
  name: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

async function getTenantBilling(tenantId: string) {
  const { rows } = await db.query<TenantBillingRow>(
    `SELECT name, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id
       FROM tenants WHERE id = $1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

function requireStripe() {
  const stripe = getStripe();
  if (!stripe) throw new BillingError("Los pagos con tarjeta aún no están configurados.");
  return stripe;
}

// Estados de Stripe en los que la suscripción sigue viva (cobra o intenta cobrar).
const LIVE_STRIPE_STATUSES: readonly Stripe.Subscription.Status[] = ["active", "trialing", "past_due", "unpaid"];

function isLive(subscription: Stripe.Subscription) {
  return LIVE_STRIPE_STATUSES.includes(subscription.status);
}

// Tiene una suscripción de Stripe vigente: los cambios van por la API, no por un checkout nuevo.
export function hasLiveSubscription(row: { status: SubscriptionStatus; stripeSubscriptionId: string | null }) {
  return Boolean(row.stripeSubscriptionId) && (row.status === "active" || row.status === "past_due");
}

// true/false según Stripe; null si Stripe no está configurado o no respondió.
export async function isStripeSubscriptionLive(subscriptionId: string) {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    return isLive(await stripe.subscriptions.retrieve(subscriptionId));
  } catch (error) {
    console.error(`No pudimos consultar la suscripción ${subscriptionId} en Stripe:`, error);
    return null;
  }
}

function productIdOf(item: Stripe.SubscriptionItem) {
  const product = item.price.product;
  return typeof product === "string" ? product : product.id;
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // incomplete: el primer pago no se ha completado; no cambia nada.
      return null;
  }
}

// Fin del periodo actual; si se canceló, cuándo terminó.
function periodEnd(subscription: Stripe.Subscription, status: SubscriptionStatus) {
  if (status === "canceled") {
    const endedAt = subscription.ended_at ?? subscription.canceled_at;
    return endedAt ? new Date(endedAt * 1000) : new Date();
  }
  const items = subscription.items.data;
  if (items.length === 0) return null;
  return new Date(Math.max(...items.map((item) => item.current_period_end)) * 1000);
}

// Módulos del taller según la suscripción. Mientras Stripe la tenga en prueba (pagó antes de que
// terminara la prueba gratuita), conserva todos; al activarse quedan solo los que se cobran.
function subscriptionModules(subscription: Stripe.Subscription) {
  if (subscription.status === "trialing") return normalizeModules(MODULE_KEYS);
  const billed = subscription.items.data
    .map((item) => moduleFromProductId(productIdOf(item)))
    .filter((key): key is string => key !== null);
  return normalizeModules(billed);
}

function idOf(value: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function resolveTenantId(subscription: Stripe.Subscription) {
  const fromMetadata = subscription.metadata?.tenantId;
  if (fromMetadata && UUID_PATTERN.test(fromMetadata)) return fromMetadata;
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM tenants WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2 LIMIT 1",
    [subscription.id, idOf(subscription.customer)],
  );
  return rows[0]?.id ?? null;
}

// Copia al taller el estado de la suscripción. Es idempotente: se puede repetir con el mismo
// objeto. Sin `claim` solo aplica a la suscripción que el taller tiene registrada, para que
// eventos de una suscripción vieja o desligada no pisen el estado actual.
export async function syncSubscription(subscription: Stripe.Subscription, options: { claim?: boolean } = {}) {
  const status = mapStatus(subscription.status);
  if (!status) return;
  const tenantId = await resolveTenantId(subscription);
  if (!tenantId) {
    console.warn(`Suscripción de Stripe ${subscription.id} sin taller asociado.`);
    return;
  }

  // Al cancelarse se conservan los módulos que tenía; no hay renglones que leer.
  const modules = status === "canceled" ? null : subscriptionModules(subscription);

  await db.query(
    `UPDATE tenants
        SET subscription_status = $2,
            current_period_end = $3,
            stripe_customer_id = COALESCE(stripe_customer_id, $4),
            stripe_subscription_id = $5,
            modules = COALESCE($6::text[], modules),
            -- La gracia de un pago pendiente cuenta desde la primera vez que se detectó.
            past_due_since = CASE WHEN $2 = 'past_due' THEN COALESCE(past_due_since, now()) END
      WHERE id = $1
        AND (stripe_subscription_id = $5 OR $7::boolean)`,
    [
      tenantId,
      status,
      periodEnd(subscription, status),
      idOf(subscription.customer),
      subscription.id,
      modules,
      options.claim ?? false,
    ],
  );
}

// Trae la suscripción fresca de Stripe y la sincroniza. Así el orden de los eventos no importa.
export async function syncSubscriptionById(subscriptionId: string, options: { claim?: boolean } = {}) {
  const subscription = await requireStripe().subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription, options);
}

// Checkout terminado: liga la suscripción nueva al taller que la pagó. Si el taller ya tenía
// otra suscripción viva (dos checkouts a la vez), se cancela la nueva para no cobrar doble.
export async function syncCheckoutSession(checkout: Stripe.Checkout.Session, expectedTenantId?: string) {
  const tenantId = checkout.metadata?.tenantId ?? checkout.client_reference_id;
  if (!tenantId || !UUID_PATTERN.test(tenantId)) return false;
  if (expectedTenantId && tenantId !== expectedTenantId) return false;
  if (checkout.mode !== "subscription" || checkout.status !== "complete" || !checkout.subscription) return false;

  const stripe = requireStripe();
  const subscriptionId = idOf(checkout.subscription)!;
  const tenant = await getTenantBilling(tenantId);
  if (!tenant) return false;

  if (tenant.stripe_subscription_id && tenant.stripe_subscription_id !== subscriptionId) {
    const current = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id).catch(() => null);
    if (current && isLive(current)) {
      const duplicate = await stripe.subscriptions.retrieve(subscriptionId);
      if (isLive(duplicate)) {
        await stripe.subscriptions.cancel(subscriptionId);
        console.error(
          `Suscripción duplicada ${subscriptionId} del taller ${tenantId} cancelada; ya tenía ${current.id}. ` +
            "Revisa en Stripe si hay que reembolsar el cobro.",
        );
      }
      return false;
    }
  }

  await syncSubscriptionById(subscriptionId, { claim: true });
  // Primer cobro al historial, sin esperar a invoice.paid.
  const invoiceId = idOf(checkout.invoice);
  if (invoiceId) {
    await syncInvoiceById(invoiceId).catch((error) => console.error("Error al guardar la factura del checkout:", error));
  }
  return true;
}

// Al volver de Stripe con ?session_id=…: no depende de que el webhook haya llegado.
export async function syncCheckoutSessionById(tenantId: string, checkoutSessionId: string) {
  const stripe = getStripe();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(checkoutSessionId)) return false;
  try {
    const checkout = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    return await syncCheckoutSession(checkout, tenantId);
  } catch (error) {
    console.error("Error al confirmar el pago con Stripe:", error);
    return false;
  }
}

// El cliente de Stripe del taller; se crea (una sola vez) antes del primer checkout.
async function ensureCustomer(stripe: Stripe, tenantId: string, tenant: TenantBillingRow, email: string) {
  if (tenant.stripe_customer_id) return tenant.stripe_customer_id;

  // La llave de idempotencia evita dos clientes si se hace doble clic.
  const customer = await stripe.customers.create(
    { email, name: tenant.name, metadata: { tenantId } },
    { idempotencyKey: `cellfix-customer-${tenantId}` },
  );
  const { rows } = await db.query<{ stripe_customer_id: string }>(
    `UPDATE tenants SET stripe_customer_id = COALESCE(stripe_customer_id, $2)
      WHERE id = $1 RETURNING stripe_customer_id`,
    [tenantId, customer.id],
  );
  return rows[0]?.stripe_customer_id ?? customer.id;
}

type PlanItem = { productId: string; name: string; unitAmount: number };

async function planItems(stripe: Stripe, modules: ModuleKey[]) {
  const pricing = await getPublicPricing();
  const items: PlanItem[] = [
    { productId: BASE_PRODUCT_ID, name: "CellFix: reparaciones, clientes y equipo", unitAmount: pricing.baseCents },
    ...pricing.modules
      .filter((module) => modules.includes(module.key))
      .map((module) => ({
        productId: moduleProductId(module.key),
        name: `CellFix: ${MODULES[module.key].label}`,
        unitAmount: module.priceCents,
      })),
  ];
  for (const item of items) await ensureProduct(stripe, item.productId, item.name);
  return { currency: pricing.currency, items };
}

function priceData(currency: string, item: PlanItem) {
  return {
    currency,
    product: item.productId,
    unit_amount: item.unitAmount,
    recurring: { interval: "month" as const },
  };
}

// Crea la sesión de Stripe Checkout para suscribirse con la base y los módulos elegidos.
// Devuelve la URL a la que hay que mandar al usuario: el pago o, si en Stripe ya existe una
// suscripción viva del taller, de vuelta a la página de suscripción (ya sincronizada).
export async function createCheckoutUrl(input: {
  tenantId: string;
  email: string;
  modules: ModuleKey[];
  baseUrl: string;
}) {
  const stripe = requireStripe();
  const tenant = await getTenantBilling(input.tenantId);
  if (!tenant) throw new BillingError("No encontramos el taller.");
  if (hasLiveSubscription({ status: tenant.subscription_status, stripeSubscriptionId: tenant.stripe_subscription_id })) {
    throw new BillingError("Tu taller ya tiene una suscripción activa.");
  }

  const billingUrl = `${input.baseUrl}/dashboard/suscripcion`;
  const customerId = await ensureCustomer(stripe, input.tenantId, tenant, input.email);

  // Una suscripción viva en Stripe que la base no refleja (webhook perdido): se liga y no se cobra de nuevo.
  const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  const live = existing.data.find(isLive);
  if (live) {
    await syncSubscription(live, { claim: true });
    return billingUrl;
  }

  const modules = normalizeModules(input.modules);
  const { currency, items } = await planItems(stripe, modules);
  const metadata = { tenantId: input.tenantId, modules: modules.join(",") };

  // Si paga durante la prueba, no pierde los días que le quedan: el primer cobro es al terminar.
  // Stripe exige que el fin de la prueba sea al menos 48 horas después.
  const trialEnd =
    tenant.subscription_status === "trialing" &&
    tenant.trial_ends_at &&
    tenant.trial_ends_at.getTime() - Date.now() > 49 * 60 * 60 * 1000
      ? Math.floor(tenant.trial_ends_at.getTime() / 1000)
      : undefined;

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: items.map((item) => ({ price_data: priceData(currency, item), quantity: 1 })),
    client_reference_id: input.tenantId,
    metadata,
    subscription_data: { metadata, trial_end: trialEnd },
    customer: customerId,
    locale: "es-419",
    success_url: `${billingUrl}?pagado=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: billingUrl,
  });

  if (!checkout.url) throw new BillingError("Stripe no devolvió la página de pago.");
  return checkout.url;
}

// Cambia los módulos de una suscripción vigente. Stripe prorratea: lo que se agrega se cobra
// en la siguiente factura por los días que falten y lo que se quita se abona.
// Los renglones que se quedan conservan su precio; los precios nuevos aplican a lo que se agrega.
export async function updateSubscriptionModules(tenantId: string, requested: ModuleKey[]) {
  const stripe = requireStripe();
  const tenant = await getTenantBilling(tenantId);
  if (
    !tenant?.stripe_subscription_id ||
    !hasLiveSubscription({ status: tenant.subscription_status, stripeSubscriptionId: tenant.stripe_subscription_id })
  ) {
    throw new BillingError("Tu taller no tiene una suscripción activa.");
  }

  const modules = normalizeModules(requested);
  const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
  const { currency, items } = await planItems(stripe, modules);
  const wanted = new Set(items.map((item) => item.productId));
  const existing = new Map(subscription.items.data.map((item) => [productIdOf(item), item]));

  const changes = [
    // Quita lo que ya no eligió (solo productos de CellFix).
    ...subscription.items.data
      .filter((item) => {
        const productId = productIdOf(item);
        return (productId === BASE_PRODUCT_ID || moduleFromProductId(productId)) && !wanted.has(productId);
      })
      .map((item) => ({ id: item.id, deleted: true as const })),
    // Agrega lo nuevo con el precio actual.
    ...items.filter((item) => !existing.has(item.productId)).map((item) => ({ price_data: priceData(currency, item), quantity: 1 })),
  ];

  if (changes.length === 0) return;

  const updated = await stripe.subscriptions.update(subscription.id, {
    items: changes,
    metadata: { tenantId, modules: modules.join(",") },
    proration_behavior: "create_prorations",
  });
  await syncSubscription(updated);
}

// Módulos que cobra hoy la suscripción vigente (sin la regla de la prueba), para decidir qué
// cambios se permiten con un pago pendiente.
export async function getBilledModules(tenantId: string) {
  const stripe = requireStripe();
  const tenant = await getTenantBilling(tenantId);
  if (!tenant?.stripe_subscription_id) return [];
  const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
  return normalizeModules(
    subscription.items.data
      .map((item) => moduleFromProductId(productIdOf(item)))
      .filter((key): key is string => key !== null),
  );
}

// Portal de Stripe para cambiar la tarjeta, ver facturas o cancelar.
export async function createPortalUrl(tenantId: string, returnUrl: string) {
  const stripe = requireStripe();
  const tenant = await getTenantBilling(tenantId);
  if (!tenant?.stripe_customer_id) throw new BillingError("Tu taller aún no tiene pagos registrados en Stripe.");
  const portal = await stripe.billingPortal.sessions.create({ customer: tenant.stripe_customer_id, return_url: returnUrl });
  return portal.url;
}

// Suscripción del taller para su página de suscripción.
export async function getTenantSubscription(tenantId: string) {
  const row = await getTenantBilling(tenantId);
  return {
    status: row?.subscription_status ?? "active",
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
  };
}
