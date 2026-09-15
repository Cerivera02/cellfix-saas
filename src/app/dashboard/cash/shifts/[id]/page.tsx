import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/cash/print-button";
import { SaleStatusBadge } from "@/components/cash/sale-status-badge";
import { ShiftBreakdown } from "@/components/cash/shift-breakdown";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { getShift } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { ORDER_PAYMENT_KIND_LABELS } from "@/lib/orders/labels";
import { formatMoney } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Corte de caja — CellFix",
};

export default async function ShiftPage(props: PageProps<"/dashboard/cash/shifts/[id]">) {
  const session = await requireAnyTenantPermission(["cash.operate", "cash.view"]);
  const { id } = await props.params;

  const data = await getShift(session.tenant.id, id);
  if (!data) notFound();

  const { summary, movements, sales, orderPayments } = data;
  const closed = summary.closedAt !== null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/cash/shifts" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Cortes de caja
        </Link>
        <PrintButton label={closed ? "Imprimir corte" : "Imprimir resumen"} />
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{closed ? "Corte de caja" : "Turno en curso"}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {session.tenant.name} · Apertura {dateTimeFormatter.format(summary.openedAt)}
        {summary.openedByName && ` (${summary.openedByName})`}
        {summary.closedAt && ` · Cierre ${dateTimeFormatter.format(summary.closedAt)}`}
        {summary.closedByName && ` (${summary.closedByName})`}
      </p>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 print:border-0 print:p-0">
        <ShiftBreakdown summary={summary} />
        {summary.closingNotes && (
          <p className="mt-6 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700">Notas: {summary.closingNotes}</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Entradas y salidas de efectivo</h2>
        {movements.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Sin movimientos manuales en este turno.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Motivo</th>
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-5 py-3 whitespace-nowrap text-zinc-500">{dateTimeFormatter.format(movement.createdAt)}</td>
                    <td className="px-5 py-3 text-zinc-900">{movement.reason}</td>
                    <td className="px-5 py-3 text-zinc-600">{movement.userName || "—"}</td>
                    <td
                      className={`px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                        movement.kind === "in" ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {movement.kind === "in" ? "+" : "−"}
                      {formatMoney(movement.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Ventas del turno</h2>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Sin ventas en este turno.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Folio</th>
                  <th className="px-5 py-3 font-medium">Hora</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/cash/sales/${sale.id}`} className="font-medium text-zinc-900 hover:underline">
                        #{sale.folio}
                      </Link>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-zinc-500">{dateTimeFormatter.format(sale.createdAt)}</td>
                    <td className="px-5 py-3 text-zinc-700">{sale.customerName || "—"}</td>
                    <td className="px-5 py-3">
                      <SaleStatusBadge total={sale.total} refundedTotal={sale.refundedTotal} />
                    </td>
                    <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {orderPayments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Cobros de órdenes del turno</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Orden</th>
                  <th className="px-5 py-3 font-medium">Hora</th>
                  <th className="px-5 py-3 font-medium">Concepto</th>
                  <th className="px-5 py-3 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orderPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/orders/${payment.orderId}`} className="font-medium text-zinc-900 hover:underline">
                        #{payment.folio}
                      </Link>
                      <p className="text-xs text-zinc-500">{payment.customerName}</p>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-zinc-500">{dateTimeFormatter.format(payment.createdAt)}</td>
                    <td className="px-5 py-3 text-zinc-700">
                      {ORDER_PAYMENT_KIND_LABELS[payment.kind]} · {PAYMENT_METHOD_LABELS[payment.method]}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                        payment.kind === "refund" ? "text-red-700" : ""
                      }`}
                    >
                      {payment.kind === "refund" && "−"}
                      {formatMoney(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
