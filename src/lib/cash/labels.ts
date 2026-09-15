export const PAYMENT_METHODS = ["cash", "debit_card", "credit_card", "transfer"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  debit_card: "Tarjeta de débito",
  credit_card: "Tarjeta de crédito",
  transfer: "Transferencia",
};

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}
