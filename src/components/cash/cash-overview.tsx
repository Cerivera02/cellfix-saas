import Link from "next/link";
import { OpenShiftButton } from "@/components/cash/open-shift-prompt";
import { DifferenceText } from "@/components/cash/shift-breakdown";
import type { CashDashboard } from "@/lib/cash/core";
import { dateTimeFormatter, timeFormatter } from "@/lib/cash/format";
import { fromCents, toCents } from "@/lib/cash/money";
import { formatMoney } from "@/lib/inventory/format";

// Sección "Caja" del inicio para quien puede ver cortes (cash.view): efectivo actual, ingresos y
// egresos del turno, últimos movimientos y últimos cortes. Solo lectura; abrir la caja usa la
// ventana del panel (OpenShiftButton no pinta nada sin cash.operate).

const cardClass = "rounded-2xl border border-zinc-200 bg-white p-5";
const labelClass = "text-xs font-medium tracking-wide text-zinc-500 uppercase";

function sum(...values: string[]) {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}

// Hora si fue hoy; fecha y hora si fue otro día.
function formatWhen(date: Date, now: Date) {
  return date.toDateString() === now.toDateString() ? timeFormatter.format(date) : dateTimeFormatter.format(date);
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="text-zinc-900 tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}

function SignedAmount({ value }: { value: string }) {
  const cents = toCents(value);
  return (
    <span className={`font-medium whitespace-nowrap tabular-nums ${cents < 0 ? "text-red-700" : "text-emerald-700"}`}>
      {cents < 0 ? "−" : "+"}
      {formatMoney(fromCents(Math.abs(cents)))}
    </span>
  );
}

export function CashOverview({ data, now }: { data: CashDashboard; now: Date }) {
  const { openShift: shift, activity, recentShifts } = data;

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Caja</h2>
        <Link href="/dashboard/cash/shifts" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
          Cortes de caja →
        </Link>
      </div>

      {shift ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className={cardClass}>
              <p className={labelClass}>Efectivo en caja ahora</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(shift.expectedCash)}</p>
              <p className="mt-3 text-sm text-zinc-600">
                <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Caja abierta desde {formatWhen(shift.openedAt, now)}
                {shift.openedByName && ` por ${shift.openedByName}`}
              </p>
              <p className="mt-1 text-sm text-zinc-500 tabular-nums">Fondo inicial {formatMoney(shift.openingAmount)}</p>
            </div>

            <div className={cardClass}>
              <div className="flex items-baseline justify-between gap-4">
                <p className={labelClass}>Ingresos del turno</p>
                <p className="font-semibold tabular-nums">
                  {formatMoney(
                    sum(
                      shift.paymentsByMethod.cash,
                      shift.paymentsByMethod.debit_card,
                      shift.paymentsByMethod.credit_card,
                      shift.paymentsByMethod.transfer,
                      shift.cashIn,
                    ),
                  )}
                </p>
              </div>
              <dl className="mt-2 divide-y divide-zinc-100">
                <Line label="Efectivo" value={shift.paymentsByMethod.cash} />
                <Line label="Tarjeta" value={sum(shift.paymentsByMethod.debit_card, shift.paymentsByMethod.credit_card)} />
                <Line label="Transferencia" value={shift.paymentsByMethod.transfer} />
                <Line label="Entradas de efectivo" value={shift.cashIn} />
              </dl>
            </div>

            <div className={cardClass}>
              <div className="flex items-baseline justify-between gap-4">
                <p className={labelClass}>Egresos del turno</p>
                <p className="font-semibold tabular-nums">
                  {formatMoney(sum(shift.cashOut, shift.supplierPayments, shift.refundsTotal))}
                </p>
              </div>
              <dl className="mt-2 divide-y divide-zinc-100">
                <Line label="Salidas de efectivo" value={shift.cashOut} />
                <Line label="Pagos a proveedores" value={shift.supplierPayments} />
                <Line label="Devoluciones y reembolsos" value={shift.refundsTotal} />
              </dl>
            </div>
          </div>

          <div className={`mt-4 ${cardClass}`}>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-medium">Últimos movimientos</h3>
              <Link
                href={`/dashboard/cash/shifts/${shift.id}`}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
              >
                Ver turno completo →
              </Link>
            </div>
            {activity.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Aún no hay movimientos en este turno.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100">
                {activity.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      {item.href ? (
                        <Link href={item.href} className="block truncate text-zinc-900 hover:underline">
                          {item.concept}
                        </Link>
                      ) : (
                        <p className="truncate text-zinc-900">{item.concept}</p>
                      )}
                      <p className="text-xs text-zinc-500">
                        {timeFormatter.format(item.createdAt)}
                        {item.userName && ` · ${item.userName}`}
                      </p>
                    </div>
                    <SignedAmount value={item.amount} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className={`mt-4 flex flex-wrap items-center justify-between gap-4 ${cardClass}`}>
          <div>
            <p className="font-medium">
              <span className="mr-1.5 inline-block size-2 rounded-full bg-zinc-300" aria-hidden="true" />
              La caja está cerrada
            </p>
            {recentShifts[0] && (
              <p className="mt-1 text-sm text-zinc-500">
                Último corte: {dateTimeFormatter.format(recentShifts[0].closedAt)}
                {recentShifts[0].closedByName && ` por ${recentShifts[0].closedByName}`}
              </p>
            )}
          </div>
          <OpenShiftButton />
        </div>
      )}

      <div className={`mt-4 ${cardClass}`}>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium">Últimos cortes</h3>
          <Link href="/dashboard/cash/shifts" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Ver todos los cortes →
          </Link>
        </div>
        {recentShifts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Aún no hay cortes de caja.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {recentShifts.map((row) => (
              <li key={row.id} className="relative grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/cash/shifts/${row.id}`}
                    className="text-zinc-900 after:absolute after:inset-0 after:content-[''] hover:underline"
                  >
                    {dateTimeFormatter.format(row.closedAt)}
                  </Link>
                  <p className="truncate text-xs text-zinc-500">
                    Abrió {row.openedByName || "—"} · cerró {row.closedByName || "—"}
                  </p>
                </div>
                <p className="text-zinc-600 tabular-nums sm:text-right">
                  Ingresos <span className="text-zinc-900">{formatMoney(row.income)}</span>
                </p>
                <div className="tabular-nums sm:text-right">
                  <p className="text-zinc-600">
                    Contado <span className="text-zinc-900">{formatMoney(row.countedAmount)}</span>
                    <span className="text-zinc-400"> / </span>
                    esperado {formatMoney(row.expectedAmount)}
                  </p>
                  <p className="text-xs font-medium">
                    <DifferenceText expected={row.expectedAmount} counted={row.countedAmount} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
