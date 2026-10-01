import { toCents } from "@/lib/cash/money";

export const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export const timeFormatter = new Intl.DateTimeFormat("es-MX", { timeStyle: "short" });

// "012180001234567891" → "012 180 00123456789 1" (banco, plaza, cuenta, verificador).
export function formatClabe(clabe: string) {
  if (clabe.length !== 18) return clabe;
  return `${clabe.slice(0, 3)} ${clabe.slice(3, 6)} ${clabe.slice(6, 17)} ${clabe.slice(17)}`;
}

export function describeAccount(account: { bankName: string; alias: string }) {
  return account.alias ? `${account.bankName} · ${account.alias}` : account.bankName;
}

export type SaleStatus = "completed" | "partial" | "refunded";

export function getSaleStatus(total: string, refundedTotal: string): SaleStatus {
  const refunded = toCents(refundedTotal);
  if (refunded === 0) return "completed";
  return refunded >= toCents(total) ? "refunded" : "partial";
}

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Pagada",
  partial: "Devolución parcial",
  refunded: "Devuelta",
};
