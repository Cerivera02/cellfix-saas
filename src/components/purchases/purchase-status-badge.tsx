import { PURCHASE_STATUS_LABELS, getPurchaseStatus } from "@/lib/purchases/labels";

const STYLES = {
  paid: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-800",
  overdue: "bg-red-50 text-red-700",
} as const;

export function PurchaseStatusBadge({
  total,
  paidTotal,
  isOverdue,
}: {
  total: string;
  paidTotal: string;
  isOverdue: boolean;
}) {
  const status = getPurchaseStatus(total, paidTotal, isOverdue);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {PURCHASE_STATUS_LABELS[status]}
    </span>
  );
}
