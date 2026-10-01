import type { Metadata } from "next";
import Link from "next/link";
import { CashOverview } from "@/components/cash/cash-overview";
import { MonthSummarySection, TechnicianProductivitySection } from "@/components/reports/owner-reports";
import { requireTenantSession } from "@/lib/auth/session";
import { getCashDashboard } from "@/lib/cash/core";
import { getOrderCounts } from "@/lib/orders/core";
import { ACTIVE_ORDER_STATUSES, ORDER_ACCESS_PERMISSIONS, ORDER_STATUS_LABELS } from "@/lib/orders/labels";
import { getOwnerReports, type ProductivityPeriod } from "@/lib/reports/core";

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

// Avisos al regresar al inicio desde una sección a la que no se pudo entrar.
const NOTICES: Record<string, string> = {
  "sin-permiso": "No tienes permiso para entrar a esa sección. Si la necesitas, pídele al propietario del taller que te la asigne.",
  "modulo-inactivo": "Esa sección no está activa en tu taller.",
};

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const session = await requireTenantSession();
  const { aviso, productividad } = await props.searchParams;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const firstName = session.user.name.split(" ")[0];
  const canSeeOrders = ORDER_ACCESS_PERMISSIONS.some((permission) => session.permissions.includes(permission));
  const isTechnician = session.permissions.includes("repairs.work");
  // Resumen de caja solo para quien ve cortes (propietario, supervisor); recepción solo abre y cierra.
  // El permiso ya viene filtrado por el módulo de Caja.
  const canSeeCash = session.permissions.includes("cash.view");
  // Resumen del mes y productividad: solo con reports.view (propietario por omisión).
  const canSeeReports = session.permissions.includes("reports.view");
  const period: ProductivityPeriod = productividad === "semana" ? "week" : "month";
  const now = new Date();
  const [counts, cash, reports] = await Promise.all([
    canSeeOrders ? getOrderCounts(session.tenant.id, session.user.id) : null,
    canSeeCash ? getCashDashboard(session.tenant.id, { activityLimit: 8, shiftsLimit: 5 }) : null,
    canSeeReports ? getOwnerReports(session.tenant.id, period, now) : null,
  ]);

  return (
    <>
      {notice && (
        <p role="status" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Estás en <span className="font-medium text-zinc-900">{session.tenant.name}</span>
        {session.roleNames.length > 0
          ? ` como ${listFormatter.format(session.roleNames)}.`
          : ", pero aún no tienes roles asignados."}
      </p>

      {/* Orden pedido por el propietario: equipos, caja, resumen del mes y productividad. */}
      {counts && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">Equipos en el taller</h2>
            <Link href="/dashboard/orders" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Ver órdenes →
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="En proceso" value={counts.views.active} href="/dashboard/orders" />
            <Stat label="Por tomar" value={counts.views.unassigned} href="/dashboard/orders?vista=unassigned" />
            {isTechnician && <Stat label="Mis órdenes" value={counts.views.mine} href="/dashboard/orders?vista=mine" />}
            <Stat label="Listas para entregar" value={counts.views.ready} href="/dashboard/orders?vista=ready" />
          </div>

          {counts.views.active > 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="font-medium">Órdenes por estado</h3>
              <ul className="mt-3 divide-y divide-zinc-100">
                {ACTIVE_ORDER_STATUSES.filter((status) => counts.byStatus[status]).map((status) => (
                  <li key={status} className="flex justify-between py-2 text-sm">
                    <span className="text-zinc-700">{ORDER_STATUS_LABELS[status]}</span>
                    <span className="font-medium tabular-nums">{counts.byStatus[status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {cash && <CashOverview data={cash} now={now} />}

      {reports && (
        <>
          <MonthSummarySection summary={reports.month} />
          <TechnicianProductivitySection period={period} rows={reports.technicians} />
        </>
      )}
    </>
  );
}
