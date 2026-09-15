import type { Metadata } from "next";
import Link from "next/link";
import { primaryButtonClass } from "@/components/ui/form";
import { requireTenantSession } from "@/lib/auth/session";
import { getOrderCounts } from "@/lib/orders/core";
import { ACTIVE_ORDER_STATUSES, ORDER_ACCESS_PERMISSIONS, ORDER_STATUS_LABELS } from "@/lib/orders/labels";

export const metadata: Metadata = {
  title: "Panel — CellFix",
};

const listFormatter = new Intl.ListFormat("es", { type: "conjunction" });

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await requireTenantSession();
  const firstName = session.user.name.split(" ")[0];
  const canSeeOrders = ORDER_ACCESS_PERMISSIONS.some((permission) => session.permissions.includes(permission));
  const isTechnician = session.permissions.includes("repairs.work");
  const counts = canSeeOrders ? await getOrderCounts(session.tenant.id, session.user.id) : null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Estás en <span className="font-medium text-zinc-900">{session.tenant.name}</span>
        {session.roleNames.length > 0
          ? ` como ${listFormatter.format(session.roleNames)}.`
          : ", pero aún no tienes roles asignados."}
      </p>

      {counts && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="En proceso" value={counts.views.active} href="/dashboard/orders" />
            <Stat label="Por tomar" value={counts.views.unassigned} href="/dashboard/orders?vista=unassigned" />
            {isTechnician && <Stat label="Mis órdenes" value={counts.views.mine} href="/dashboard/orders?vista=mine" />}
            <Stat label="Listas para entregar" value={counts.views.ready} href="/dashboard/orders?vista=ready" />
          </div>

          {counts.views.active > 0 ? (
            <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="font-medium">Órdenes por estado</h2>
              <ul className="mt-3 divide-y divide-zinc-100">
                {ACTIVE_ORDER_STATUSES.filter((status) => counts.byStatus[status]).map((status) => (
                  <li key={status} className="flex justify-between py-2 text-sm">
                    <span className="text-zinc-700">{ORDER_STATUS_LABELS[status]}</span>
                    <span className="font-medium tabular-nums">{counts.byStatus[status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
              <p className="font-medium">No hay equipos en reparación</p>
              {session.permissions.includes("orders.intake") && (
                <Link href="/dashboard/orders/new" className={`mt-4 inline-block ${primaryButtonClass}`}>
                  Recibir equipo
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
