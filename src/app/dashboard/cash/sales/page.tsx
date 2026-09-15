import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { SaleStatusBadge } from "@/components/cash/sale-status-badge";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { listSales } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { formatMoney } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Ventas — CellFix",
};

export default async function SalesPage(props: PageProps<"/dashboard/cash/sales">) {
  const session = await requireAnyTenantPermission(["sales.create", "cash.view"]);
  const searchParams = await props.searchParams;
  const search = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const sales = await listSales(session.tenant.id, { search });

  return (
    <>
      <PageHeader
        eyebrow="Caja"
        title="Ventas"
        actions={
          session.permissions.includes("sales.create") && (
            <Link href="/dashboard/cash" className={primaryButtonClass}>
              Nueva venta
            </Link>
          )
        }
      />

      <Form action="/dashboard/cash/sales" className="flex w-full max-w-md gap-2">
        <input
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Buscar por folio o cliente"
          aria-label="Buscar ventas"
          className={inputClass}
        />
        <button type="submit" className={secondaryButtonClass}>
          Buscar
        </button>
      </Form>

      {sales.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">{search ? "Sin resultados" : "Aún no hay ventas"}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {search ? "Prueba con otro folio o nombre." : "Las ventas registradas en la caja aparecerán aquí."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Folio</th>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 text-right font-medium">Piezas</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Atendió</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Ver</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sales.map((sale) => (
                <tr key={sale.id} className="group relative transition hover:bg-zinc-50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/dashboard/cash/sales/${sale.id}`}
                      className="font-medium text-zinc-900 tabular-nums after:absolute after:inset-0 after:content-['']"
                    >
                      #{sale.folio}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-zinc-600">{dateTimeFormatter.format(sale.createdAt)}</td>
                  <td className="px-5 py-3.5 text-zinc-700">{sale.customerName || "—"}</td>
                  <td className="px-5 py-3.5 text-right text-zinc-700 tabular-nums">{sale.itemCount}</td>
                  <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap text-zinc-900 tabular-nums">
                    {formatMoney(sale.total)}
                  </td>
                  <td className="px-5 py-3.5">
                    <SaleStatusBadge total={sale.total} refundedTotal={sale.refundedTotal} />
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600">{sale.userName || "—"}</td>
                  <td className="px-5 py-3.5 text-right text-lg text-zinc-300 transition group-hover:text-zinc-900">
                    <span aria-hidden="true">›</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.length === 200 && (
        <p className="mt-3 text-xs text-zinc-500">Se muestran las 200 ventas más recientes; busca por folio para ver otras.</p>
      )}
    </>
  );
}
