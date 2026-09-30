import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/billing/stripe";

// Historial de pagos: copia de las facturas de Stripe de cada taller, con los ids del cobro
// (PaymentIntent y Charge), el recibo y el motivo si falló. Todo sale de la API de Stripe.

export type PaymentStatus = "draft" | "open" | "paid" | "uncollectible" | "void" | "failed";

export type SubscriptionPayment = {
  id: string;
  stripeInvoiceId: string;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  number: string | null;
  status: PaymentStatus;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  receiptUrl: string | null;
  failureMessage: string | null;
  createdAt: Date;
};

// Estados de factura que se guardan (los borradores no).
const STORED_STATUSES: readonly string[] = ["open", "paid", "uncollectible", "void"];

function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function toDate(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000) : null;
}

async function resolveTenantId(customerId: string | null, subscriptionId: string | null) {
  if (!customerId && !subscriptionId) return null;
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM tenants
      WHERE ($1::text IS NOT NULL AND stripe_customer_id = $1)
         OR ($2::text IS NOT NULL AND stripe_subscription_id = $2)
      LIMIT 1`,
    [customerId, subscriptionId],
  );
  return rows[0]?.id ?? null;
}

// El pago que representa a la factura: el exitoso o, si no hay, el más reciente.
function mainPayment(invoice: Stripe.Invoice) {
  const payments = invoice.payments?.data ?? [];
  return payments.find((payment) => payment.status === "paid") ?? [...payments].sort((a, b) => b.created - a.created)[0];
}

// Ids del cobro, recibo y motivo de falla. En esta versión de la API la factura ya no trae
// payment_intent/charge: se leen de invoice.payments y luego del PaymentIntent (latest_charge).
async function paymentDetails(stripe: Stripe, invoice: Stripe.Invoice) {
  const payment = mainPayment(invoice)?.payment;
  let paymentIntentId = idOf(payment?.payment_intent);
  let charge: Stripe.Charge | null = null;
  let failureMessage: string | null = null;

  if (paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    paymentIntentId = intent.id;
    charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    failureMessage = intent.last_payment_error?.message ?? null;
  } else if (payment?.charge) {
    charge = typeof payment.charge === "string" ? await stripe.charges.retrieve(payment.charge) : payment.charge;
  }

  return {
    paymentIntentId,
    chargeId: charge?.id ?? null,
    receiptUrl: charge?.receipt_url ?? null,
    failureMessage: failureMessage ?? charge?.failure_message ?? null,
  };
}

// Guarda (o actualiza) una factura. Idempotente por stripe_invoice_id; ignora borradores,
// facturas de $0 y clientes que no son de ningún taller.
async function upsertInvoice(stripe: Stripe, invoice: Stripe.Invoice) {
  if (!invoice.id || !STORED_STATUSES.includes(invoice.status ?? "")) return;
  if (invoice.amount_due === 0 && invoice.amount_paid === 0) return;

  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  const tenantId = await resolveTenantId(idOf(invoice.customer), subscriptionId);
  if (!tenantId) {
    console.warn(`Factura de Stripe ${invoice.id} sin taller asociado (cliente ${idOf(invoice.customer)}).`);
    return;
  }

  const details = await paymentDetails(stripe, invoice);
  const failed = invoice.status === "open" && invoice.attempted && Boolean(details.failureMessage);
  const status: PaymentStatus = failed ? "failed" : (invoice.status as PaymentStatus);

  await db.query(
    `INSERT INTO subscription_payments (
       tenant_id, stripe_invoice_id, stripe_subscription_id, stripe_payment_intent_id, stripe_charge_id,
       number, status, amount_due, amount_paid, currency, period_start, period_end, paid_at,
       hosted_invoice_url, invoice_pdf, receipt_url, failure_message, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, subscription_payments.stripe_payment_intent_id),
       stripe_charge_id = COALESCE(EXCLUDED.stripe_charge_id, subscription_payments.stripe_charge_id),
       number = EXCLUDED.number,
       status = EXCLUDED.status,
       amount_due = EXCLUDED.amount_due,
       amount_paid = EXCLUDED.amount_paid,
       currency = EXCLUDED.currency,
       period_start = EXCLUDED.period_start,
       period_end = EXCLUDED.period_end,
       paid_at = EXCLUDED.paid_at,
       hosted_invoice_url = EXCLUDED.hosted_invoice_url,
       invoice_pdf = EXCLUDED.invoice_pdf,
       receipt_url = COALESCE(EXCLUDED.receipt_url, subscription_payments.receipt_url),
       failure_message = CASE WHEN EXCLUDED.status = 'paid' THEN NULL ELSE EXCLUDED.failure_message END`,
    [
      tenantId,
      invoice.id,
      subscriptionId,
      details.paymentIntentId,
      details.chargeId,
      invoice.number,
      status,
      invoice.amount_due,
      invoice.amount_paid,
      invoice.currency,
      toDate(invoice.period_start),
      toDate(invoice.period_end),
      toDate(invoice.status_transitions?.paid_at),
      invoice.hosted_invoice_url ?? null,
      invoice.invoice_pdf ?? null,
      details.receiptUrl,
      details.failureMessage,
      toDate(invoice.created) ?? new Date(),
    ],
  );
}

// Trae la factura fresca de Stripe (con sus pagos) y la guarda. Para el webhook y el checkout.
export async function syncInvoiceById(invoiceId: string) {
  const stripe = getStripe();
  if (!stripe) return;
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
  await upsertInvoice(stripe, invoice);
}

// Trae de Stripe las facturas del cliente del taller (hasta 100, las más recientes) y las guarda.
// Devuelve cuántas revisó; null si Stripe no está configurado o el taller no tiene cliente.
export async function backfillTenantPayments(tenantId: string) {
  const stripe = getStripe();
  if (!stripe) return null;
  const { rows } = await db.query<{ stripe_customer_id: string | null }>(
    "SELECT stripe_customer_id FROM tenants WHERE id = $1",
    [tenantId],
  );
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return null;

  const invoices = await stripe.invoices.list({ customer: customerId, limit: 100, expand: ["data.payments"] });
  for (const invoice of invoices.data) await upsertInvoice(stripe, invoice);
  return invoices.data.length;
}

type PaymentRow = {
  id: string;
  stripe_invoice_id: string;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  number: string | null;
  status: PaymentStatus;
  amount_due: number | null;
  amount_paid: number | null;
  currency: string | null;
  period_start: Date | null;
  period_end: Date | null;
  paid_at: Date | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  receipt_url: string | null;
  failure_message: string | null;
  created_at: Date;
};

// Pagos del taller, del más reciente al más antiguo. Quien llama verifica permisos.
export async function listTenantPayments(tenantId: string, limit = 100): Promise<SubscriptionPayment[]> {
  const { rows } = await db.query<PaymentRow>(
    `SELECT id, stripe_invoice_id, stripe_subscription_id, stripe_payment_intent_id, stripe_charge_id, number,
            status, amount_due, amount_paid, currency, period_start, period_end, paid_at,
            hosted_invoice_url, invoice_pdf, receipt_url, failure_message, created_at
       FROM subscription_payments
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    stripeInvoiceId: row.stripe_invoice_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeChargeId: row.stripe_charge_id,
    number: row.number,
    status: row.status,
    amountDue: row.amount_due,
    amountPaid: row.amount_paid,
    currency: row.currency,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    paidAt: row.paid_at,
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdf: row.invoice_pdf,
    receiptUrl: row.receipt_url,
    failureMessage: row.failure_message,
    createdAt: row.created_at,
  }));
}

// Para la página del dueño: si aún no hay pagos guardados pero el taller tiene cliente en Stripe,
// los trae una vez. Un error de Stripe no rompe la página.
export async function listTenantPaymentsWithBackfill(tenantId: string, hasStripeCustomer: boolean) {
  let payments = await listTenantPayments(tenantId);
  if (payments.length === 0 && hasStripeCustomer) {
    try {
      const fetched = await backfillTenantPayments(tenantId);
      if (fetched) payments = await listTenantPayments(tenantId);
    } catch (error) {
      console.error("Error al traer el historial de pagos de Stripe:", error);
    }
  }
  return payments;
}
