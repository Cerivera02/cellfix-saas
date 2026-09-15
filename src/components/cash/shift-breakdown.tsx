import type { ShiftSummary } from "@/lib/cash/core";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents, toCents } from "@/lib/cash/money";
import { formatMoney } from "@/lib/inventory/format";

function Row({ label, value, strong, subtract }: { label: string; value: string; strong?: boolean; subtract?: boolean }) {
  const showMinus = subtract && toCents(value) > 0;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className={strong ? "font-medium text-zinc-900" : "text-zinc-600"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-zinc-900" : "text-zinc-900"}`}>
        {showMinus && "−"}
        {formatMoney(value)}
      </dd>
    </div>
  );
}

// Sobrante, faltante o cuadra, con color.
export function DifferenceText({ expected, counted }: { expected: string; counted: string }) {
  const difference = toCents(counted) - toCents(expected);
  if (difference === 0) return <span className="text-emerald-700">Cuadra</span>;
  return (
    <span className={difference > 0 ? "text-amber-700" : "text-red-700"}>
      {difference > 0 ? "Sobrante " : "Faltante "}
      {formatMoney(fromCents(Math.abs(difference)))}
    </span>
  );
}

export function ShiftBreakdown({ summary }: { summary: ShiftSummary }) {
  const closed = summary.closedAt !== null && summary.expectedAmount !== null && summary.countedAmount !== null;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Efectivo en caja</h3>
        <dl className="mt-2 divide-y divide-zinc-100">
          <Row label="Fondo inicial" value={summary.openingAmount} />
          <Row label="Cobros en efectivo" value={summary.paymentsByMethod.cash} />
          <Row label="Entradas de efectivo" value={summary.cashIn} />
          <Row label="Salidas de efectivo" value={summary.cashOut} subtract />
          <Row label="Pagos a proveedores" value={summary.supplierPayments} subtract />
          <Row label="Reembolsos en efectivo" value={summary.cashRefunds} subtract />
          <Row
            label={closed ? "Esperado al cierre" : "Esperado en caja"}
            value={closed ? (summary.expectedAmount ?? "0") : summary.expectedCash}
            strong
          />
          {closed && (
            <>
              <Row label="Contado" value={summary.countedAmount ?? "0"} strong />
              <div className="flex justify-between gap-4 py-1.5 text-sm">
                <dt className="font-medium text-zinc-900">Diferencia</dt>
                <dd className="font-semibold tabular-nums">
                  <DifferenceText expected={summary.expectedAmount ?? "0"} counted={summary.countedAmount ?? "0"} />
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section>
        <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Cobros del turno</h3>
        <dl className="mt-2 divide-y divide-zinc-100">
          <Row
            label={summary.salesCount === 1 ? "1 venta" : `${summary.salesCount} ventas`}
            value={summary.salesTotal}
            strong
          />
          <Row
            label={summary.ordersCount === 1 ? "Cobros de 1 orden" : `Cobros de ${summary.ordersCount} órdenes`}
            value={summary.ordersCollected}
            strong
          />
          <Row label={PAYMENT_METHOD_LABELS.cash} value={summary.paymentsByMethod.cash} />
          <Row label={PAYMENT_METHOD_LABELS.debit_card} value={summary.paymentsByMethod.debit_card} />
          <Row label={PAYMENT_METHOD_LABELS.credit_card} value={summary.paymentsByMethod.credit_card} />
          <Row label={PAYMENT_METHOD_LABELS.transfer} value={summary.paymentsByMethod.transfer} />
          <Row label="Devoluciones y reembolsos" value={summary.refundsTotal} subtract />
        </dl>
      </section>
    </div>
  );
}
