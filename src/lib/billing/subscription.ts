import "server-only";
import { createHash } from "node:crypto";
import StripeLib from "stripe";
import type Stripe from "stripe";
import { db, withTransaction } from "@/lib/db";
import type { SubscriptionStatus } from "@/lib/billing/access";
import { formatCents } from "@/lib/billing/format";
import { syncInvoiceById } from "@/lib/billing/payments";
import { getPublicPricing } from "@/lib/billing/pricing";
import { checkoutTrial, minimumChargeCents } from "@/lib/billing/rules";
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

// Resultado de confirmar un checkout: "confirmed" (pagado o en prueba, suscripción viva),
// "pending" (Stripe aún procesa el pago), "invalid" (no es de este taller o no terminó) y
// "duplicate" (el taller ya tenía otra suscripción; la nueva se canceló).
export type CheckoutOutcome = "confirmed" | "pending" | "invalid" | "duplicate";

// Checkout terminado: liga la suscripción nueva al taller que la pagó. Si el taller ya tenía
// otra suscripción viva (dos checkouts a la vez), se cancela la nueva para no cobrar doble.
export async function syncCheckoutSession(
  checkout: Stripe.Checkout.Session,
  expectedTenantId?: string,
): Promise<CheckoutOutcome> {
  const tenantId = checkout.metadata?.tenantId ?? checkout.client_reference_id;
  if (!tenantId || !UUID_PATTERN.test(tenantId)) return "invalid";
  if (expectedTenantId && tenantId !== expectedTenantId) return "invalid";
  if (checkout.mode !== "subscription" || checkout.status !== "complete" || !checkout.subscription) return "invalid";

  const stripe = requireStripe();
  const subscriptionId = idOf(checkout.subscription)!;
  const tenant = await getTenantBilling(tenantId);
  if (!tenant) return "invalid";
  // El cliente del checkout debe ser el del taller (siempre se crea uno por taller antes de pagar).
  if (tenant.stripe_customer_id && idOf(checkout.customer) !== tenant.stripe_customer_id) {
    console.error(`Checkout ${checkout.id} con un cliente distinto al del taller ${tenantId}.`);
    return "invalid";
  }

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
      return "duplicate";
    }
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription, { claim: true });
  // Primer cobro al historial, sin esperar a invoice.paid.
  const invoiceId = idOf(checkout.invoice);
  if (invoiceId) {
    await syncInvoiceById(invoiceId).catch((error) => logStripeError("Error al guardar la factura del checkout", error));
  }

  // "no_payment_required" es el caso de pagar durante la prueba: no se cobra hoy.
  const paid = checkout.payment_status === "paid" || checkout.payment_status === "no_payment_required";
  return paid && (subscription.status === "active" || subscription.status === "trialing") ? "confirmed" : "pending";
}

// Al volver de Stripe con ?session_id=…: no depende de que el webhook haya llegado.
export async function syncCheckoutSessionById(tenantId: string, checkoutSessionId: string): Promise<CheckoutOutcome> {
  const stripe = getStripe();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(checkoutSessionId)) return "invalid";
  try {
    const checkout = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    return await syncCheckoutSession(checkout, tenantId);
  } catch (error) {
    logStripeError("Error al confirmar el pago con Stripe", error);
    return "pending";
  }
}

// Registra un error de Stripe con sus ids, sin mostrarlo al usuario.
export function logStripeError(context: string, error: unknown) {
  if (error instanceof StripeLib.errors.StripeError) {
    console.error(`${context}:`, {
      type: error.type,
      code: error.code,
      requestId: error.requestId,
      statusCode: error.statusCode,
      message: error.message,
    });
  } else {
    console.error(`${context}:`, error);
  }
}

// Evita dos operaciones de cobro a la vez en el mismo taller (doble clic, dos pestañas).
// El candado de Postgres se suelta al terminar la transacción.
async function withBillingLock<T>(tenantId: string, callback: () => Promise<T>) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked",
      [`billing:${tenantId}`],
    );
    if (!rows[0]?.locked) throw new BillingError("Ya hay un cambio de plan en proceso. Espera unos segundos.");
    return callback();
  });
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

// El cliente de Stripe del taller; se crea (una sola vez) antes del primer checkout.
async function ensureCustomer(stripe: Stripe, tenantId: string, tenant: TenantBillingRow, email: string) {
  if (tenant.stripe_customer_id) return tenant.stripe_customer_id;

  // La llave de idempotencia evita dos clientes si se hace doble clic.
  const customer = await stripe.customers.create(
    { email, name: tenant.name, metadata: { tenantId } },
    { idempotencyKey: `cellfix-customer-${tenantId}-${hashKey(email)}` },
  );
  const { rows } = await db.query<{ stripe_customer_id: string }>(
    `UPDATE tenants SET stripe_customer_id = COALESCE(stripe_customer_id, $2)
      WHERE id = $1 RETURNING stripe_customer_id`,
    [tenantId, customer.id],
  );
  return rows[0]?.stripe_customer_id ?? customer.id;
}

type PlanItem = { productId: string; name: string; unitAmount: number };

// Conceptos del plan con los precios vigentes en la base (se leen en cada petición).
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

function assertMinimum(totalCents: number, currency: string) {
  const minimum = minimumChargeCents(currency);
  if (totalCents < minimum) {
    throw new BillingError(
      `El total mensual debe ser de al menos ${formatCents(minimum, currency)} para poder cobrarlo con tarjeta.`,
    );
  }
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
  return withBillingLock(input.tenantId, async () => {
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
    assertMinimum(
      items.reduce((sum, item) => sum + item.unitAmount, 0),
      currency,
    );

    const metadata = { tenantId: input.tenantId, modules: modules.join(",") };
    const trial = checkoutTrial({ status: tenant.subscription_status, trialEndsAt: tenant.trial_ends_at });

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: items.map((item) => ({ price_data: priceData(currency, item), quantity: 1 })),
      client_reference_id: input.tenantId,
      metadata,
      subscription_data: {
        metadata,
        ...(trial?.trialEnd ? { trial_end: trial.trialEnd } : {}),
        ...(trial?.trialPeriodDays ? { trial_period_days: trial.trialPeriodDays } : {}),
      },
      customer: customerId,
      locale: "es-419",
      success_url: `${billingUrl}?pagado=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${billingUrl}?cancelado=1`,
    };

    // Mismos datos en la misma ventana de 10 minutos = la misma sesión (doble clic, reintentos).
    const timeWindow = Math.floor(Date.now() / (10 * 60 * 1000));
    const checkout = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `cellfix-checkout-${input.tenantId}-${timeWindow}-${hashKey(JSON.stringify(params))}`,
    });

    if (!checkout.url) throw new BillingError("Stripe no devolvió la página de pago.");
    return checkout.url;
  });
}

// Renglones a quitar y agregar para dejar la suscripción con los módulos pedidos. Valida
// moneda, cambios vacíos y el cargo mínimo del nuevo total.
async function moduleChanges(stripe: Stripe, subscription: Stripe.Subscription, requested: ModuleKey[]) {
  const modules = normalizeModules(requested);
  const { currency, items } = await planItems(stripe, modules);
  if (subscription.currency !== currency) {
    console.error(
      `Suscripción ${subscription.id} en ${subscription.currency} y precios de la plataforma en ${currency}: ` +
        "no se mezclan monedas; ajusta el plan desde Stripe.",
    );
    throw new BillingError(
      `Tu suscripción se cobra en ${subscription.currency.toUpperCase()} y los precios actuales están en ${currency.toUpperCase()}. Escríbenos para ajustar tu plan.`,
    );
  }

  const wanted = new Set(items.map((item) => item.productId));
  const existing = new Map(subscription.items.data.map((item) => [productIdOf(item), item]));
  const removed = subscription.items.data.filter((item) => {
    const productId = productIdOf(item);
    return (productId === BASE_PRODUCT_ID || moduleFromProductId(productId)) && !wanted.has(productId);
  });
  const added = items.filter((item) => !existing.has(item.productId));
  if (removed.length === 0 && added.length === 0) throw new BillingError("Tu plan ya tiene esos módulos.");

  // Lo que queda conserva su precio; lo nuevo entra al precio actual.
  const kept = subscription.items.data.filter((item) => !removed.includes(item));
  const monthlyTotalCents =
    kept.reduce((sum, item) => sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1), 0) +
    added.reduce((sum, item) => sum + item.unitAmount, 0);
  assertMinimum(monthlyTotalCents, currency);

  return {
    modules,
    currency,
    monthlyTotalCents,
    items: [
      ...removed.map((item) => ({ id: item.id, deleted: true as const })),
      ...added.map((item) => ({ price_data: priceData(currency, item), quantity: 1 })),
    ],
  };
}

async function liveSubscriptionOf(stripe: Stripe, tenantId: string) {
  const tenant = await getTenantBilling(tenantId);
  if (
    !tenant?.stripe_subscription_id ||
    !tenant.stripe_customer_id ||
    !hasLiveSubscription({ status: tenant.subscription_status, stripeSubscriptionId: tenant.stripe_subscription_id })
  ) {
    throw new BillingError("Tu taller no tiene una suscripción activa.");
  }
  const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
  if (!isLive(subscription)) throw new BillingError("Tu suscripción ya no está activa. Recarga la página.");
  return { subscription, customerId: tenant.stripe_customer_id };
}

function currentPeriodEnd(subscription: Stripe.Subscription) {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null;
}

// Próximo cobro: fin de la prueba de Stripe si la hay; si no, fin del periodo actual.
function nextChargeDate(subscription: Stripe.Subscription) {
  if (subscription.status === "trialing" && subscription.trial_end) return new Date(subscription.trial_end * 1000);
  return currentPeriodEnd(subscription);
}

export type ModuleChangePreview = {
  modules: ModuleKey[];
  currency: string;
  // Ajuste prorrateado por los días que faltan (positivo: se cobra; negativo: saldo a favor).
  prorationCents: number;
  // Próxima factura con el cambio incluido y su fecha (ISO).
  nextInvoiceCents: number;
  nextChargeAt: string | null;
  // Nuevo total mensual a partir del siguiente periodo.
  monthlyTotalCents: number;
  // Fecha de prorrateo (segundos) que se usa al confirmar, para cobrar lo mismo que se mostró.
  prorationDate: number;
};

// Vista previa del cambio de módulos con la factura que Stripe generaría.
export async function previewModuleChange(tenantId: string, requested: ModuleKey[]): Promise<ModuleChangePreview> {
  const stripe = requireStripe();
  const { subscription, customerId } = await liveSubscriptionOf(stripe, tenantId);
  const change = await moduleChanges(stripe, subscription, requested);
  const prorationDate = Math.floor(Date.now() / 1000);

  const preview = await stripe.invoices.createPreview({
    customer: customerId,
    subscription: subscription.id,
    subscription_details: { items: change.items, proration_behavior: "create_prorations", proration_date: prorationDate },
  });
  const prorationCents = preview.lines.data
    .filter((line) => line.parent?.subscription_item_details?.proration)
    .reduce((sum, line) => sum + line.amount, 0);

  return {
    modules: change.modules,
    currency: change.currency,
    prorationCents,
    nextInvoiceCents: preview.amount_due,
    nextChargeAt: nextChargeDate(subscription)?.toISOString() ?? null,
    monthlyTotalCents: change.monthlyTotalCents,
    prorationDate,
  };
}

// Cambia los módulos de una suscripción vigente. Stripe prorratea: lo que se agrega se cobra
// en la siguiente factura por los días que faltan y lo que se quita se abona.
// Los renglones que se quedan conservan su precio; los precios nuevos aplican a lo que se agrega.
export async function updateSubscriptionModules(tenantId: string, requested: ModuleKey[], prorationDate?: number) {
  const stripe = requireStripe();
  await withBillingLock(tenantId, async () => {
    const { subscription } = await liveSubscriptionOf(stripe, tenantId);
    const change = await moduleChanges(stripe, subscription, requested);
    // La fecha de la vista previa solo se acepta si es reciente (y nunca futura).
    const now = Math.floor(Date.now() / 1000);
    const validDate = prorationDate && prorationDate <= now && now - prorationDate <= 30 * 60 ? prorationDate : now;

    const updated = await stripe.subscriptions.update(
      subscription.id,
      {
        items: change.items,
        metadata: { tenantId, modules: change.modules.join(",") },
        proration_behavior: "create_prorations",
        proration_date: validDate,
      },
      { idempotencyKey: `cellfix-modules-${subscription.id}-${validDate}-${change.modules.join(",")}` },
    );
    await syncSubscription(updated);
  });
}

function billedModulesOf(subscription: Stripe.Subscription) {
  return normalizeModules(
    subscription.items.data
      .map((item) => moduleFromProductId(productIdOf(item)))
      .filter((key): key is string => key !== null),
  );
}

// Módulos que cobra hoy la suscripción vigente (sin la regla de la prueba), para decidir qué
// cambios se permiten con un pago pendiente.
export async function getBilledModules(tenantId: string) {
  const stripe = requireStripe();
  const tenant = await getTenantBilling(tenantId);
  if (!tenant?.stripe_subscription_id) return [];
  const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
  return billedModulesOf(subscription);
}

export type LiveSubscriptionDetails = {
  stripeStatus: Stripe.Subscription.Status;
  currency: string;
  billedModules: ModuleKey[];
  monthlyTotalCents: number;
  // Prueba de Stripe (pagó antes de que terminara la prueba gratuita).
  trialEndsAt: Date | null;
  // Cancelación programada: la suscripción termina en esta fecha y no se vuelve a cobrar.
  endsAt: Date | null;
  nextCharge: { at: Date; amountCents: number } | null;
  paymentMethod: { brand: string; last4: string } | null;
};

function cardOf(value: string | Stripe.PaymentMethod | null | undefined) {
  if (!value || typeof value === "string" || !value.card) return null;
  return { brand: value.card.brand, last4: value.card.last4 };
}

// Lo que Stripe sabe hoy de la suscripción del taller: módulos cobrados, total, próximo cobro,
// tarjeta y cancelación programada. null si no hay suscripción viva o Stripe no responde.
export async function getLiveSubscriptionDetails(tenantId: string): Promise<LiveSubscriptionDetails | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const tenant = await getTenantBilling(tenantId);
  if (!tenant?.stripe_subscription_id) return null;

  try {
    const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id, {
      expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"],
    });
    if (!isLive(subscription)) return null;

    const customer =
      typeof subscription.customer === "object" && !subscription.customer.deleted ? subscription.customer : null;
    const paymentMethod =
      cardOf(subscription.default_payment_method) ?? cardOf(customer?.invoice_settings?.default_payment_method);

    const endsAt = subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : subscription.cancel_at_period_end
        ? currentPeriodEnd(subscription)
        : null;
    const trialEndsAt =
      subscription.status === "trialing" && subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    const monthlyTotalCents = subscription.items.data.reduce(
      (sum, item) => sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1),
      0,
    );

    let nextCharge: LiveSubscriptionDetails["nextCharge"] = null;
    const nextAt = nextChargeDate(subscription);
    if (!endsAt && nextAt) {
      const preview = await stripe.invoices
        .createPreview({ customer: idOf(subscription.customer)!, subscription: subscription.id })
        .catch((error: unknown) => {
          logStripeError("No pudimos calcular el próximo cobro", error);
          return null;
        });
      nextCharge = { at: nextAt, amountCents: preview?.amount_due ?? monthlyTotalCents };
    }

    return {
      stripeStatus: subscription.status,
      currency: subscription.currency,
      billedModules: billedModulesOf(subscription),
      monthlyTotalCents,
      trialEndsAt,
      endsAt,
      nextCharge,
      paymentMethod,
    };
  } catch (error) {
    logStripeError("No pudimos consultar la suscripción en Stripe", error);
    return null;
  }
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
    trialEndsAt: row?.trial_ends_at ?? null,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
  };
}
