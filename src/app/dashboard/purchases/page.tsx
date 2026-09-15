import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { fromCents, toCents } from "@/lib/cash/money";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { listPurchases, type PurchaseView } from "@/lib/purchases/core";
import { PURCHASE_TERMS_LABELS } from "@/lib/purchases/labels";

export const metadata: Metadata = {
  title: "Compras — CellFix",
};

const VIEW_LABELS: Record<PurchaseView, string> = { all: "Todas", payable: "Por pagar" };

export default async function PurchasesPage(props: PageProps<"/dashboard/purchases">) {
  const session = await requireAnyTenantPermission(["purchases.manage", "inventory.view"]);
  const canManage = session.permissions.includes("purchases.manage");

  const searchParams = await props.searchParams;
  const search = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const view: PurchaseView = searchParams.vista === "por-pagar" ? "payable" : "all";

  const { purchases, debts, counts } = await listPurchases(session.tenant.id, { view, search });
  const totalDebt = debts.reduce((sum, debt) => sum + toCents(debt.balance), 0);

  const viewHref = (target: PurchaseView) => {
    const params = new URLSearchParams();
    if (target === "payable") params.set("vista", "por-pagar");
    if (search) params.set("q", search);
    const query = params.toString();
    return query ? `/dashboard/purchases?${query}` : "/dashboard/purchases";
  };

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Compras"
        description="Mercancía recibida de proveedores: sube existencias y registra lo que se pagó o se debe."
        actions={
          canManage && (
            <Link href="/dashboard/purchases/new" className={primaryButtonClass}>
              Registrar compra
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vistas" className="flex gap-2">
          {(["all", "payable"] as const).map((option) => (
            <Link
              key={option}
              href={viewHref(option)}
              aria-current={view === option ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                view === option
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
              }`}
            >
              {VIEW_LABELS[option]} <span className="tabular-nums opacity-70">{counts[option]}</span>
            </Link>
          ))}
        </nav>

        <Form action="/dashboard/purchases" className="flex w-full max-w-md gap-2">
          {view === "payable" && <input type="hidden" name="vista" value="por-pagar" />}
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Folio, factura o proveedor"
            aria-label="Buscar compras"
            className={inputClass}
          />
          <button type="submit" className={secondaryButtonClass}>
            Buscar
          </button>
        </Form>
      </div>

      {view === "payable" && debts.length > 0 && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Deuda con proveedores</h2>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(fromCents(totalDebt))}</p>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100">
            {debts.map((debt) => (
              <li key={debt.supplierId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{debt.supplierName}</p>
                  <p className={`text-xs ${debt.hasOverdue ? "text-red-700" : "text-zinc-500"}`}>
                    {debt.purchasesCount === 1 ? "1 compra" : `${debt.purchasesCount} compras`}
                    {debt.nextDueOn && ` · próximo vencimiento ${formatDay(debt.nextDueOn)}`}
                    {debt.hasOverdue && " · con saldo vencido"}
                  </p>
                </div>
                <p className="font-medium tabular-nums">{formatMoney(debt.balance)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {purchases.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">
            {search ? "Sin resultados" : view === "payable" ? "No hay saldos pendientes" : "Aún no hay compras"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {search ? "Prueba con otro folio o proveedor." : "Cada compra registrada sube las existencias de sus artículos."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Compra</th>
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-5 py-3 font-medium">Condición</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {purchases.map((purchase) => {
                const balance = toCents(purchase.total) - toCents(purchase.paidTotal);
                return (
                  <tr key={purchase.id} className="relative align-top transition hover:bg-zinc-50">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/purchases/${purchase.id}`}
                        className="font-medium text-zinc-900 tabular-nums after:absolute after:inset-0 after:content-['']"
                      >
                        #{purchase.folio}
                      </Link>
                      <p className="text-xs text-zinc-500">
                        {formatDay(purchase.purchasedOn)}
                        {purchase.invoiceNumber && ` · Fact. ${purchase.invoiceNumber}`}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-700">
                      {purchase.supplierName}
                      <p className="text-xs text-zinc-500">
                        {purchase.itemCount === 1 ? "1 pieza" : `${purchase.itemCount} piezas`}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-700">
                      {PURCHASE_TERMS_LABELS[purchase.terms]}
                      {purchase.dueOn && <p className="text-xs text-zinc-500">Vence {formatDay(purchase.dueOn)}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <PurchaseStatusBadge
                        total={purchase.total}
                        paidTotal={purchase.paidTotal}
                        isOverdue={purchase.isOverdue}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap tabular-nums">{formatMoney(purchase.total)}</td>
                    <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {balance > 0 ? formatMoney(fromCents(balance)) : <span className="font-normal text-zinc-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
