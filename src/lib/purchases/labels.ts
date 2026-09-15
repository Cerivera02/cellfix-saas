import { toCents } from "@/lib/cash/money";

export type PurchaseTerms = "cash" | "credit";

export const PURCHASE_TERMS_LABELS: Record<PurchaseTerms, string> = {
  cash: "Contado",
  credit: "Crédito",
};

export type PurchaseStatus = "paid" | "pending" | "overdue";

export function getPurchaseStatus(total: string, paidTotal: string, isOverdue: boolean): PurchaseStatus {
  if (toCents(paidTotal) >= toCents(total)) return "paid";
  return isOverdue ? "overdue" : "pending";
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  paid: "Pagada",
  pending: "Por pagar",
  overdue: "Vencida",
};
