import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";

// Webhook de Stripe. Es público (el proxy no lo cubre): la firma es la única prueba de origen,
// así que se verifica con el cuerpo tal como llegó, antes de leer cualquier dato.
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return new Response("Stripe no está configurado.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Falta la firma.", { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("Firma inválida.", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (error) {
    // 500 hace que Stripe reintente el evento más tarde.
    console.error(`Error al procesar el evento de Stripe ${event.id} (${event.type}):`, error);
    return new Response("Error al procesar el evento.", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
