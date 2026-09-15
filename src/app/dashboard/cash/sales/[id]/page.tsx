import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReturnDialog } from "@/components/cash/return-dialog";
import { SaleStatusBadge } from "@/components/cash/sale-status-badge";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { createReturnAction } from "@/lib/cash/actions";
import { getSale } from "@/lib/cash/core";
import { dateTimeFormatter, formatClabe } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { toCents } from "@/lib/cash/money";
import { describeTax, formatMoney } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Venta — CellFix",
};

export default async function SalePage(props: PageProps<"/dashboard/cash/sales/[id]">) {
  const session = await requireAnyTenantPermission(["sales.create", "cash.view"]);
  const canSell = session.permissions.includes("sales.create");
  const canRefund = session.permissions.includes("sales.refund");
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const sale = await getSale(session.tenant.id, id);
  if (!sale) notFound();

  const justCreated = searchParams.registrada === "1";
  const returnLines = sale.items
    .filter((item) => item.quantity > item.returnedQuantity)
    .map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      returnedQuantity: item.returnedQuantity,
      totalCents: toCents(item.total),
      refundedCents: toCents(item.refundedAmount),
    }));

  return (
    <>
      <Link href="/dashboard/cash/sales" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Ventas
      </Link>

      {justCreated && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div>
            <p className="font-medium text-emerald-900">Venta registrada</p>
            {toCents(sale.changeAmount) > 0 && (
              <p className="text-sm text-emerald-800">
                Cambio a entregar: <span className="font-semibold tabular-nums">{formatMoney(sale.changeAmount)}</span>
              </p>
            )}
          </div>
          {canSell && (
            <Link href="/dashboard/cash" className={primaryButtonClass}>
              Nueva venta
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">Venta #{sale.folio}</h1>
            <SaleStatusBadge total={sale.total} refundedTotal={sale.refundedTotal} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {dateTimeFormatter.format(sale.createdAt)}
            {sale.userName && ` · Atendió ${sale.userName}`}
            {sale.customerName && (
              <>
                {" · Cliente: "}
                {sale.customerId ? (
                  <Link href={`/dashboard/customers/${sale.customerId}`} className="font-medium text-zinc-900 hover:underline">
                    {sale.customerName}
                  </Link>
                ) : (
                  sale.customerName
                )}
                {sale.customerPhone && ` (${sale.customerPhone})`}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/cash/sales/${sale.id}/ticket`} className={secondaryButtonClass}>
            Ver ticket
          </Link>
          {canRefund && returnLines.length > 0 && (
            <ReturnDialog action={createReturnAction.bind(null, sale.id)} lines={returnLines} />
          )}
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Artículo</th>
                <th className="px-5 py-3 text-right font-medium">Cant.</th>
                <th className="px-5 py-3 text-right font-medium">Precio</th>
                <th className="px-5 py-3 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sale.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-5 py-3">
                    <p className="text-zinc-900">{item.itemName}</p>
                    <p className="text-xs text-zinc-500">
                      {describeTax(item.taxRate, item.taxIncluded)}
                      {item.returnedQuantity > 0 && (
                        <span className="text-amber-700"> · {item.returnedQuantity} devuelta(s)</span>
                      )}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums">{formatMoney(item.unitPrice)}</td>
                  <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-zinc-200 text-sm">
              <tr>
                <td colSpan={3} className="px-5 pt-3 text-right text-zinc-600">
                  Subtotal
                </td>
                <td className="px-5 pt-3 text-right tabular-nums">{formatMoney(sale.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-5 text-right text-zinc-600">
                  IVA
                </td>
                <td className="px-5 text-right tabular-nums">{formatMoney(sale.taxTotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-5 pb-3 text-right font-medium">
                  Total
                </td>
                <td className="px-5 pb-3 text-right text-base font-semibold tabular-nums">{formatMoney(sale.total)}</td>
              </tr>
              {toCents(sale.refundedTotal) > 0 && (
                <tr>
                  <td colSpan={3} className="px-5 pb-3 text-right text-amber-700">
                    Devuelto
                  </td>
                  <td className="px-5 pb-3 text-right text-amber-700 tabular-nums">−{formatMoney(sale.refundedTotal)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Pagos</h2>
          {sale.payments.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Venta sin cobro (total en cero).</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {sale.payments.map((payment) => (
                <li key={payment.id} className="py-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-900">{PAYMENT_METHOD_LABELS[payment.method]}</span>
                    <span className="font-medium tabular-nums">{formatMoney(payment.amount)}</span>
                  </div>
                  {payment.method === "transfer" && payment.bankName && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {payment.bankName} · {payment.holderName}
                      {payment.clabe && <span className="block font-mono">CLABE {formatClabe(payment.clabe)}</span>}
                    </p>
                  )}
                  {payment.reference && <p className="mt-0.5 text-xs text-zinc-500">Ref. {payment.reference}</p>}
                </li>
              ))}
            </ul>
          )}
          {sale.cashReceived !== null && (
            <dl className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-600">Efectivo recibido</dt>
                <dd className="tabular-nums">{formatMoney(sale.cashReceived)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-600">Cambio</dt>
                <dd className="tabular-nums">{formatMoney(sale.changeAmount)}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      {sale.returns.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Devoluciones</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {sale.returns.map((saleReturn) => (
              <li key={saleReturn.id} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-900">
                      Reembolso de {formatMoney(saleReturn.refundTotal)} en{" "}
                      {PAYMENT_METHOD_LABELS[saleReturn.refundMethod].toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-zinc-500">
                      {dateTimeFormatter.format(saleReturn.createdAt)}
                      {saleReturn.userName && ` · ${saleReturn.userName}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
                    {saleReturn.restocked ? "Regresó al inventario" : "No regresó al inventario"}
                  </span>
                </div>
                <p className="mt-2 text-zinc-700">Motivo: {saleReturn.reason}</p>
                <ul className="mt-2 text-zinc-600">
                  {saleReturn.items.map((item, index) => (
                    <li key={index}>
                      {item.quantity} × {item.itemName} · {formatMoney(item.amount)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
