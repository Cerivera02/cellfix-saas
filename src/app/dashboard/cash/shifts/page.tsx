import type { Metadata } from "next";
import Link from "next/link";
import { CashMovementForm } from "@/components/cash/cash-movement-form";
import { CloseShiftDialog } from "@/components/cash/close-shift-dialog";
import { OpenShiftForm } from "@/components/cash/open-shift-form";
import { DifferenceText, ShiftBreakdown } from "@/components/cash/shift-breakdown";
import { PageHeader } from "@/components/ui/page-header";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { addCashMovementAction, closeShiftAction } from "@/lib/cash/actions";
import { listShifts } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { formatMoney } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Cortes de caja — CellFix",
};

export default async function ShiftsPage() {
  const session = await requireAnyTenantPermission(["cash.operate", "cash.view"]);
  const canOperate = session.permissions.includes("cash.operate");

  const shifts = await listShifts(session.tenant.id);
  const openShift = shifts.find((shift) => shift.closedAt === null) ?? null;
  const closedShifts = shifts.filter((shift) => shift.closedAt !== null);

  return (
    <>
      <PageHeader eyebrow="Caja" title="Cortes de caja" />

      {openShift ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">
                  Caja abierta{" "}
                  <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    En turno
                  </span>
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Desde {dateTimeFormatter.format(openShift.openedAt)}
                  {openShift.openedByName && ` · abrió ${openShift.openedByName}`}
                </p>
              </div>
              {canOperate && (
                <CloseShiftDialog
                  action={closeShiftAction.bind(null, openShift.id)}
                  expectedCash={openShift.expectedCash}
                />
              )}
            </div>
            <div className="mt-6">
              <ShiftBreakdown summary={openShift} />
            </div>
            <Link
              href={`/dashboard/cash/shifts/${openShift.id}`}
              className="mt-6 inline-block text-sm font-medium text-zinc-900 hover:underline"
            >
              Ver movimientos y ventas del turno →
            </Link>
          </section>

          {canOperate && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="font-medium">Entrada o salida de efectivo</h2>
              <p className="mt-1 text-sm text-zinc-500">Para gastos, cambio o retiros que no son ventas.</p>
              <div className="mt-4">
                <CashMovementForm action={addCashMovementAction} />
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="font-medium">La caja está cerrada</p>
          <p className="mt-1 text-sm text-zinc-500">
            {canOperate ? "Ábrela con el efectivo inicial para empezar un turno." : "No hay un turno en curso."}
          </p>
          {canOperate && (
            <div className="mt-6">
              <OpenShiftForm />
            </div>
          )}
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Historial de cortes</h2>
        {closedShifts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">Aún no hay cortes de caja.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Apertura</th>
                  <th className="px-5 py-3 font-medium">Cierre</th>
                  <th className="px-5 py-3 text-right font-medium">Ventas</th>
                  <th className="px-5 py-3 text-right font-medium">Esperado</th>
                  <th className="px-5 py-3 text-right font-medium">Contado</th>
                  <th className="px-5 py-3 text-right font-medium">Diferencia</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Ver</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {closedShifts.map((shift) => (
                  <tr key={shift.id} className="group relative transition hover:bg-zinc-50">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/cash/shifts/${shift.id}`}
                        className="text-zinc-900 after:absolute after:inset-0 after:content-['']"
                      >
                        {dateTimeFormatter.format(shift.openedAt)}
                      </Link>
                      {shift.openedByName && <p className="text-xs text-zinc-500">{shift.openedByName}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-zinc-700">{shift.closedAt && dateTimeFormatter.format(shift.closedAt)}</p>
                      {shift.closedByName && <p className="text-xs text-zinc-500">{shift.closedByName}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap tabular-nums">
                      <p className="text-zinc-900">{formatMoney(shift.salesTotal)}</p>
                      <p className="text-xs text-zinc-500">{shift.salesCount} venta(s)</p>
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap tabular-nums">
                      {formatMoney(shift.expectedAmount ?? "0")}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap tabular-nums">
                      {formatMoney(shift.countedAmount ?? "0")}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap tabular-nums">
                      <DifferenceText expected={shift.expectedAmount ?? "0"} counted={shift.countedAmount ?? "0"} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-lg text-zinc-300 transition group-hover:text-zinc-900">
                      <span aria-hidden="true">›</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
