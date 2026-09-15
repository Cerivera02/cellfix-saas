import { getStockStatus } from "@/lib/inventory/format";

export function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  const status = getStockStatus(stock, minStock);
  if (status === "ok") return null;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        status === "out" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {status === "out" ? "Agotado" : "Por agotarse"}
    </span>
  );
}
