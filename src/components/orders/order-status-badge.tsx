import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders/labels";

const STYLES: Record<OrderStatus, string> = {
  received: "bg-zinc-100 text-zinc-700",
  diagnosing: "bg-sky-50 text-sky-700",
  awaiting_approval: "bg-amber-50 text-amber-800",
  waiting_parts: "bg-orange-50 text-orange-800",
  in_repair: "bg-indigo-50 text-indigo-700",
  ready: "bg-emerald-50 text-emerald-700",
  delivered: "bg-zinc-900 text-white",
  cancelled: "bg-red-50 text-red-700",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
