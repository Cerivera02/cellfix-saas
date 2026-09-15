import type { MovementKind } from "@/lib/inventory/core";

const moneyFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Los importes llegan de PostgreSQL como texto ("150.50") para no perder precisión.
export function formatMoney(value: string | number) {
  return `$${moneyFormatter.format(Number(value))}`;
}

export type StockStatus = "out" | "low" | "ok";

export function getStockStatus(stock: number, minStock: number): StockStatus {
  if (stock === 0) return "out";
  if (stock <= minStock) return "low";
  return "ok";
}

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  initial: "Existencia inicial",
  purchase: "Compra",
  adjustment: "Ajuste",
  sale: "Venta",
  repair: "Uso en reparación",
  repair_return: "Regreso de reparación",
  return: "Devolución",
};

// "16.00" → "16%".
export function formatRate(value: string) {
  return `${Number(value)}%`;
}

// Cómo se aplica el IVA al precio de venta de un artículo.
export function describeTax(taxRate: string, taxIncluded: boolean) {
  if (Number(taxRate) === 0) return "Sin IVA";
  return taxIncluded ? `IVA ${formatRate(taxRate)} incluido` : `+ IVA ${formatRate(taxRate)} al cobrar`;
}
