import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { dateTimeFormatter } from "@/lib/cash/format";
import { fromCents, toCents } from "@/lib/cash/money";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { listOrders } from "@/lib/orders/core";
import {
  ORDER_ACCESS_PERMISSIONS,
  ORDER_VIEWS,
  ORDER_VIEW_LABELS,
  canSeeOrderPrices,
  describeDevice,
  isOrderView,
  type OrderView,
} from "@/lib/orders/labels";

export const metadata: Metadata = {
  title: "Órdenes — CellFix",
};

export default async function OrdersPage(props: PageProps<"/dashboard/orders">) {
  const session = await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  const canIntake = session.permissions.includes("orders.intake");
  const isTechnician = session.permissions.includes("repairs.work");
  const canSeePrices = canSeeOrderPrices(session.permissions);

  const searchParams = await props.searchParams;
  const search = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const requested = typeof searchParams.vista === "string" ? searchParams.vista : "";
  const views = ORDER_VIEWS.filter((view) => view !== "mine" || isTechnician);
  const view: OrderView = isOrderView(requested) && views.includes(requested) ? requested : "active";

  const { orders, counts } = await listOrders(session.tenant.id, { view, search, userId: session.user.id });

  const viewHref = (target: OrderView) => {
    const params = new URLSearchParams();
    if (target !== "active") params.set("vista", target);
    if (search) params.set("q", search);
    const query = params.toString();
    return query ? `/dashboard/orders?${query}` : "/dashboard/orders";
  };

  return (
    <>
      <PageHeader
        title="Órdenes"
        description="Equipos recibidos para reparación, en orden de llegada."
        actions={
          canIntake && (
            <Link href="/dashboard/orders/new" className={primaryButtonClass}>
              Recibir equipo
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-3">
        <nav aria-label="Vistas" className="flex flex-wrap gap-2">
          {views.map((option) => (
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
              {ORDER_VIEW_LABELS[option]} <span className="tabular-nums opacity-70">{counts[option]}</span>
            </Link>
          ))}
        </nav>

        <Form action="/dashboard/orders" className="flex w-full max-w-md gap-2">
          {view !== "active" && <input type="hidden" name="vista" value={view} />}
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Buscar por folio, cliente, teléfono, IMEI o modelo"
            aria-label="Buscar órdenes"
            className={inputClass}
          />
          <button type="submit" className={secondaryButtonClass}>
            Buscar
          </button>
        </Form>
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">{search ? "Sin resultados" : "No hay órdenes aquí"}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {search ? "Prueba con otro folio, nombre o IMEI." : canIntake ? "Registra un equipo con “Recibir equipo”." : ""}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Orden</th>
                <th className="px-5 py-3 font-medium">Equipo</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Técnico</th>
                {canSeePrices && <th className="px-5 py-3 text-right font-medium">Saldo</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => {
                const balance = toCents(order.total) - toCents(order.paidTotal);
                return (
                  <tr key={order.id} className="relative align-top transition hover:bg-zinc-50">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-medium text-zinc-900 tabular-nums after:absolute after:inset-0 after:content-['']"
                      >
                        #{order.folio}
                      </Link>
                      <p className="text-zinc-700">{order.customerName}</p>
                      <p className="text-xs text-zinc-500">{dateTimeFormatter.format(order.createdAt)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-zinc-900">{describeDevice(order)}</p>
                      {order.serialNumber && <p className="font-mono text-xs text-zinc-500">{order.serialNumber}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <OrderStatusBadge status={order.status} />
                      {order.promisedOn && order.status !== "delivered" && order.status !== "cancelled" && (
                        <p className="mt-1 text-xs text-zinc-500">Prometida: {formatDay(order.promisedOn)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-700">{order.technicianName || <span className="text-zinc-400">En la cola</span>}</td>
                    {canSeePrices && (
                      <td className="px-5 py-3.5 text-right whitespace-nowrap tabular-nums">
                        {balance > 0 ? formatMoney(fromCents(balance)) : <span className="text-zinc-400">—</span>}
                      </td>
                    )}
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
