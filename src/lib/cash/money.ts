// Cálculo de importes en centavos (enteros) para sumar y repartir sin errores de
// redondeo. PostgreSQL entrega los numeric como texto ("150.50").

export function toCents(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const negative = text.startsWith("-");
  const [integer, decimals = ""] = (negative ? text.slice(1) : text).split(".");
  const cents = Number(integer || "0") * 100 + Number(`${decimals}00`.slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: number): string {
  const rounded = Math.round(cents);
  const absolute = Math.abs(rounded);
  return `${rounded < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export type LineAmounts = { subtotal: number; tax: number; total: number };

// Importes de un renglón. Si el precio incluye IVA, el total es el precio y el IVA se
// desglosa; si no, el IVA se suma. Todo en centavos.
export function computeLine({
  unitPriceCents,
  quantity,
  taxRate,
  taxIncluded,
}: {
  unitPriceCents: number;
  quantity: number;
  taxRate: number;
  taxIncluded: boolean;
}): LineAmounts {
  const base = unitPriceCents * quantity;
  if (taxRate === 0) return { subtotal: base, tax: 0, total: base };

  if (taxIncluded) {
    const subtotal = Math.round((base * 100) / (100 + taxRate));
    return { subtotal, tax: base - subtotal, total: base };
  }

  const tax = Math.round((base * taxRate) / 100);
  return { subtotal: base, tax, total: base + tax };
}

// Reembolso de `returnQuantity` piezas de un renglón. Al devolver lo último que queda
// se reembolsa exactamente el resto, para que la suma nunca supere el total pagado.
export function refundForLine(
  line: { totalCents: number; quantity: number; returnedQuantity: number; refundedCents: number },
  returnQuantity: number,
) {
  const remainingCents = line.totalCents - line.refundedCents;
  if (returnQuantity >= line.quantity - line.returnedQuantity) return remainingCents;
  return Math.min(Math.round((line.totalCents * returnQuantity) / line.quantity), remainingCents);
}
