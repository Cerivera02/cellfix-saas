import "server-only";
import type Stripe from "stripe";
import { syncInvoiceById } from "@/lib/billing/payments";
import { syncCheckoutSession, syncSubscription, syncSubscriptionById } from "@/lib/billing/subscription";

function subscriptionIdOfInvoice(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

// Aplica un evento ya verificado. Los eventos de suscripción se resuelven consultando la
// suscripción actual en Stripe, así que repetirlos o recibirlos en desorden no causa daño.
export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await syncCheckoutSession(event.data.object);
      return;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.resumed":
    case "customer.subscription.paused":
      await syncSubscriptionById(event.data.object.id);
      return;

    case "customer.subscription.deleted":
      // Ya no se puede consultar como vigente: el objeto del evento es el estado final.
      await syncSubscription(event.data.object);
      return;

    case "invoice.paid": {
      await syncInvoiceById(event.data.object.id!);
      const subscriptionId = subscriptionIdOfInvoice(event.data.object);
      if (subscriptionId) await syncSubscriptionById(subscriptionId);
      return;
    }

    // Solo actualizan el historial de pagos.
    case "invoice.finalized":
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      await syncInvoiceById(event.data.object.id!);
      return;

    case "invoice.payment_failed": {
      // Se toma el estado que Stripe le dé a la suscripción (past_due al fallar una renovación);
      // si aún no cambia, llegará customer.subscription.updated.
      await syncInvoiceById(event.data.object.id!);
      const subscriptionId = subscriptionIdOfInvoice(event.data.object);
      if (subscriptionId) await syncSubscriptionById(subscriptionId);
      return;
    }

    default:
      return;
  }
}
