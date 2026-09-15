import { SALE_STATUS_LABELS, getSaleStatus, type SaleStatus } from "@/lib/cash/format";

const STYLES: Record<SaleStatus, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  refunded: "bg-zinc-100 text-zinc-600",
};

export function SaleStatusBadge({ total, refundedTotal }: { total: string; refundedTotal: string }) {
  const status = getSaleStatus(total, refundedTotal);
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {SALE_STATUS_LABELS[status]}
    </span>
  );
}
