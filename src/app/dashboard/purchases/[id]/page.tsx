import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchasePaymentDialog } from "@/components/purchases/purchase-payment-dialog";
import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge";
import { primaryButtonClass } from "@/components/ui/form";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { getOpenShift, listBankAccounts } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents, toCents } from "@/lib/cash/money";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { addPurchasePaymentAction } from "@/lib/purchases/actions";
import { getPurchase } from "@/lib/purchases/core";
import { PURCHASE_TERMS_LABELS } from "@/lib/purchases/labels";

export const metadata: Metadata = {
  title: "Compra — CellFix",
};

export default async function PurchasePage(props: PageProps<"/dashboard/purchases/[id]">) {
  const session = await requireAnyTenantPermission(["purchases.manage", "inventory.view"]);
  const canManage = session.permissions.includes("purchases.manage");
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const purchase = await getPurchase(session.tenant.id, id);
  if (!purchase) notFound();

  const balanceCents = toCents(purchase.total) - toCents(purchase.paidTotal);
  const canPay = canManage && balanceCents > 0;
  const [accounts, shift] = canPay
    ? await Promise.all([
        listBankAccounts(session.tenant.id, { activeOnly: true }),
        session.permissions.includes("cash.operate") ? getOpenShift(session.tenant.id) : null,
      ])
    : [[], null];

  return (
    <>
      <Link href="/dashboard/purchases" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Compras
      </Link>

      {searchParams.registrada === "1" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="font-medium text-emerald-900">Compra registrada; las existencias ya se actualizaron.</p>
          {canManage && (
            <Link href="/dashboard/purchases/new" className={primaryButtonClass}>
              Registrar otra
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">Compra #{purchase.folio}</h1>
            <PurchaseStatusBadge total={purchase.total} paidTotal={purchase.paidTotal} isOverdue={purchase.isOverdue} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {purchase.supplierName} · {formatDay(purchase.purchasedOn)}
            {purchase.invoiceNumber && ` · Factura o nota ${purchase.invoiceNumber}`}
          </p>
          <p className="text-sm text-zinc-500">
            {PURCHASE_TERMS_LABELS[purchase.terms]}
            {purchase.dueOn && ` · vence ${formatDay(purchase.dueOn)}`}
            {purchase.userName && ` · Registró ${purchase.userName}`}
          </p>
        </div>
        {canPay && (
          <PurchasePaymentDialog
            action={addPurchasePaymentAction.bind(null, purchase.id)}
            balanceCents={balanceCents}
            accounts={accounts.map((account) => ({
              id: account.id,
              bankName: account.bankName,
              holderName: account.holderName,
              clabe: account.clabe,
              alias: account.alias,
            }))}
            drawerAvailable={Boolean(shift)}
          />
        )}
      </div>

      {purchase.notes && <p className="mt-4 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">{purchase.notes}</p>}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Artículo</th>
                <th className="px-5 py-3 text-right font-medium">Cant.</th>
                <th className="px-5 py-3 text-right font-medium">Costo</th>
                <th className="px-5 py-3 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {purchase.lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="px-5 py-3">
                    {line.itemId ? (
                      <Link href={`/dashboard/inventory/items/${line.itemId}`} className="text-zinc-900 hover:underline">
                        {line.itemName}
                      </Link>
                    ) : (
                      <span className="text-zinc-900">{line.itemName}</span>
                    )}
                    {line.orderId && (
                      <p className="text-xs text-zinc-500">
                        Para la{" "}
                        <Link href={`/dashboard/orders/${line.orderId}`} className="hover:underline">
                          orden #{line.orderFolio}
                        </Link>
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums">{formatMoney(line.unitCost)}</td>
                  <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(line.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-zinc-200">
              <tr>
                <td colSpan={3} className="px-5 py-3 text-right font-medium">
                  Total
                </td>
                <td className="px-5 py-3 text-right text-base font-semibold tabular-nums">{formatMoney(purchase.total)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Pagos al proveedor</h2>
          {purchase.payments.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Sin pagos todavía.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {purchase.payments.map((payment) => (
                <li key={payment.id} className="py-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-900">{PAYMENT_METHOD_LABELS[payment.method]}</span>
                    <span className="font-medium tabular-nums">{formatMoney(payment.amount)}</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {dateTimeFormatter.format(payment.createdAt)}
                    {payment.method === "cash" && (payment.fromDrawer ? " · de la caja" : " · por fuera de la caja")}
                    {payment.bankName && ` · ${payment.bankName}`}
                    {payment.reference && ` · Ref. ${payment.reference}`}
                    {payment.userName && ` · ${payment.userName}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-600">Total</dt>
              <dd className="tabular-nums">{formatMoney(purchase.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-600">Pagado</dt>
              <dd className="tabular-nums">{formatMoney(purchase.paidTotal)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Saldo</dt>
              <dd className="tabular-nums">{formatMoney(fromCents(Math.max(balanceCents, 0)))}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
