import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { SaleStatusBadge } from "@/components/cash/sale-status-badge";
import { secondaryButtonClass } from "@/components/ui/form";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { CUSTOMER_ACCESS_PERMISSIONS } from "@/lib/customers/access";
import { listCustomerOrders } from "@/lib/orders/core";
import { ORDER_ACCESS_PERMISSIONS, canSeeOrderPrices, describeDevice } from "@/lib/orders/labels";
import { dateTimeFormatter } from "@/lib/cash/format";
import { setCustomerActiveAction } from "@/lib/customers/actions";
import { getCustomer } from "@/lib/customers/core";
import { cfdiUseLabel, taxRegimeLabel } from "@/lib/customers/sat";
import { formatMoney } from "@/lib/inventory/format";
import { hasModule } from "@/lib/modules";

export const metadata: Metadata = {
  title: "Cliente — CellFix",
};

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className={`mt-1 break-words text-zinc-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export default async function CustomerPage(props: PageProps<"/dashboard/customers/[id]">) {
  const session = await requireAnyTenantPermission(CUSTOMER_ACCESS_PERMISSIONS);
  const canManage = session.permissions.includes("customers.manage");
  const canSeeSales = session.permissions.includes("sales.create") || session.permissions.includes("cash.view");
  const canSeeOrders = ORDER_ACCESS_PERMISSIONS.some((permission) => session.permissions.includes(permission));
  const canSeeOrderAmounts = canSeeOrderPrices(session.permissions);
  // Sin el módulo de Caja no hay ventas de mostrador que mostrar.
  const hasCash = hasModule(session.modules, "cash");
  const { id } = await props.params;

  const [data, orders] = await Promise.all([
    getCustomer(session.tenant.id, id),
    canSeeOrders ? listCustomerOrders(session.tenant.id, id) : [],
  ]);
  if (!data) notFound();

  const { customer, sales } = data;

  return (
    <>
      <Link href="/dashboard/customers" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Clientes
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{customer.fullName}</h1>
            {!customer.isActive && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Archivado</span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">Cliente desde {dateTimeFormatter.format(customer.createdAt)}</p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/customers/${customer.id}/edit`} className={secondaryButtonClass}>
              Editar
            </Link>
            <form action={setCustomerActiveAction.bind(null, customer.id, !customer.isActive)}>
              <ConfirmSubmitButton
                message={
                  customer.isActive
                    ? `¿Archivar a ${customer.fullName}? Ya no aparecerá al cobrar, pero conserva su historial.`
                    : undefined
                }
                className={secondaryButtonClass}
              >
                {customer.isActive ? "Archivar" : "Reactivar"}
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Contacto</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Teléfono" value={customer.phone || "—"} />
            <Detail label="Correo" value={customer.email || "—"} />
            {customer.notes && (
              <div className="sm:col-span-2">
                <Detail label="Notas" value={<span className="whitespace-pre-line">{customer.notes}</span>} />
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Facturación</h2>
          {customer.tax ? (
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="RFC" value={customer.tax.taxId} mono />
              <Detail label="Código postal fiscal" value={customer.tax.taxZipCode} />
              <div className="sm:col-span-2">
                <Detail label="Nombre o razón social" value={customer.tax.legalName} />
              </div>
              <Detail label="Régimen fiscal" value={taxRegimeLabel(customer.tax.taxRegime)} />
              <Detail label="Uso del CFDI" value={cfdiUseLabel(customer.tax.cfdiUse)} />
              <div className="sm:col-span-2">
                <Detail label="Correo para facturas" value={customer.billingEmail || customer.email || "—"} />
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              No tiene datos de facturación.{canManage && " Agrégalos desde Editar si requiere factura."}
            </p>
          )}
        </section>
      </div>

      {canSeeOrders && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Órdenes de reparación</h2>
          {orders.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
              <p className="text-sm text-zinc-500">Aún no ha dejado equipos a reparar.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Orden</th>
                    <th className="px-5 py-3 font-medium">Equipo</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    {canSeeOrderAmounts && <th className="px-5 py-3 text-right font-medium">Total</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-zinc-900 hover:underline">
                          #{order.folio}
                        </Link>
                        <p className="text-xs text-zinc-500">{dateTimeFormatter.format(order.createdAt)}</p>
                      </td>
                      <td className="px-5 py-3 text-zinc-700">
                        {describeDevice(order)}
                        {order.serialNumber && <p className="font-mono text-xs text-zinc-500">{order.serialNumber}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      {canSeeOrderAmounts && (
                        <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                          {formatMoney(order.total)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {hasCash && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Historial de compras</h2>
          {sales.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
              <p className="text-sm text-zinc-500">Aún no tiene compras.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Folio</th>
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="px-5 py-3">
                        {canSeeSales ? (
                          <Link href={`/dashboard/cash/sales/${sale.id}`} className="font-medium text-zinc-900 hover:underline">
                            #{sale.folio}
                          </Link>
                        ) : (
                          <span className="font-medium text-zinc-900">#{sale.folio}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-zinc-600">{dateTimeFormatter.format(sale.createdAt)}</td>
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
      )}
    </>
  );
}
