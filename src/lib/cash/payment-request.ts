import type { PaymentInput } from "@/lib/cash/core";
import { parseMoneyCents } from "@/lib/cash/form";
import { isPaymentMethod } from "@/lib/cash/labels";

// Pagos tal como los envía el formulario de cobro del navegador (importes como texto).
export type PaymentRequest = { method: string; amount: string; bankAccountId: string | null; reference: string };

export type ChargeRequest = { payments: PaymentRequest[]; cashReceived: string | null };

// Valida la forma de los pagos recibidos. Los montos y cuentas se revisan de nuevo en el servidor.
export function parseChargeRequest(
  request: unknown,
): { payments: PaymentInput[]; cashReceivedCents: number | null } | { message: string } {
  const value = request as Partial<ChargeRequest> | null;
  if (typeof value !== "object" || value === null || !Array.isArray(value.payments) || value.payments.length > 10) {
    return { message: "Solicitud no válida." };
  }

  const payments: PaymentInput[] = [];
  for (const payment of value.payments) {
    const method = String(payment?.method ?? "");
    if (!isPaymentMethod(method)) return { message: "Método de pago no válido." };
    const amountCents = parseMoneyCents(String(payment?.amount ?? ""));
    if (amountCents === null || amountCents <= 0) return { message: "Revisa los importes de pago." };
    payments.push({
      method,
      amountCents,
      bankAccountId: method === "transfer" && payment?.bankAccountId ? String(payment.bankAccountId) : null,
      reference: String(payment?.reference ?? "").trim().slice(0, 60),
    });
  }

  const cashReceivedCents = value.cashReceived ? parseMoneyCents(String(value.cashReceived)) : null;
  if (value.cashReceived && cashReceivedCents === null) return { message: "Revisa el efectivo recibido." };

  return { payments, cashReceivedCents };
}
