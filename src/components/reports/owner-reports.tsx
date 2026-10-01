import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/inventory/format";
import type { MonthSummary, ProductivityPeriod, TechnicianProductivity } from "@/lib/reports/core";

// Secciones "Resumen del mes" y "Productividad por técnico" del inicio, para quien tiene
// reports.view (el propietario por omisión). Solo lectura; el periodo se cambia con un enlace.

const cardClass = "rounded-2xl border border-zinc-200 bg-white p-5";
const labelClass = "text-xs font-medium tracking-wide text-zinc-500 uppercase";

const monthFormatter = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Mexico_City" });
const percentFormatter = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function Change({ value }: { value: number | null }) {
  if (value === null) return null;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="text-zinc-500">= igual</span>;
  return (
    <span className={rounded > 0 ? "text-emerald-700" : "text-red-700"}>
      {rounded > 0 ? "▲" : "▼"} {percentFormatter.format(Math.abs(rounded))}%
    </span>
  );
}

function SummaryCard({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className={cardClass}>
      <p className={labelClass}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {children && <p className="mt-2 text-sm text-zinc-500 tabular-nums">{children}</p>}
    </div>
  );
}

// "6 h", "2.5 días", "40 min".
function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (hours < 24) return `${decimalFormatter.format(hours)} h`;
  const days = hours / 24;
  return `${decimalFormatter.format(days)} ${days < 1.05 ? "día" : "días"}`;
}

export function MonthSummarySection({ summary }: { summary: MonthSummary }) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Resumen de {monthFormatter.format(summary.monthStart)}</h2>
        <p className="text-sm text-zinc-500">Comparado con el mismo periodo del mes anterior</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Ingresos" value={formatMoney(summary.income)}>
          {summary.incomeChange === null ? (
            "Sin ingresos el mes anterior"
          ) : (
            <>
              <Change value={summary.incomeChange} /> vs {formatMoney(summary.previousIncome)}
            </>
          )}
        </SummaryCard>
        <SummaryCard label="Equipos recibidos" value={String(summary.received)} />
        <SummaryCard label="Equipos entregados" value={String(summary.delivered)}>
          {summary.delivered > 0 && (
            <span className="block">
              {summary.deliveredRepaired} reparados · {summary.deliveredNotRepaired} sin reparación
            </span>
          )}
          {summary.deliveredChange !== null && (
            <span className="block">
              <Change value={summary.deliveredChange} /> vs {summary.previousDelivered}
            </span>
          )}
        </SummaryCard>
        <SummaryCard
          label="Ticket promedio"
          value={summary.averageTicket === null ? "—" : formatMoney(summary.averageTicket)}
        >
          Por equipo entregado
        </SummaryCard>
      </div>
    </section>
  );
}

const PERIOD_OPTIONS: { value: ProductivityPeriod; param: string; label: string }[] = [
  { value: "week", param: "semana", label: "Esta semana" },
  { value: "month", param: "mes", label: "Este mes" },
];

export function TechnicianProductivitySection({
  period,
  rows,
}: {
  period: ProductivityPeriod;
  rows: TechnicianProductivity[];
}) {
  const hasFinished = rows.some((row) => row.finished > 0);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Productividad por técnico</h2>
        <nav aria-label="Periodo" className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
          {PERIOD_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/dashboard?productividad=${option.param}`}
              scroll={false}
              aria-current={option.value === period ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium transition ${
                option.value === period ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {hasFinished ? (
        <div className={`${cardClass} mt-4 overflow-x-auto p-0`}>
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase">
                <th className="px-5 py-3 font-medium">Técnico</th>
                <th className="px-3 py-3 text-right font-medium">Terminados</th>
                <th className="px-3 py-3 text-right font-medium">Reparados</th>
                <th className="px-3 py-3 text-right font-medium">Sin reparación</th>
                <th className="px-3 py-3 text-right font-medium">En proceso</th>
                <th className="px-5 py-3 text-right font-medium">Tiempo promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums">
              {rows.map((row) => (
                <tr key={row.technicianId ?? `nombre:${row.name}`}>
                  <td className="px-5 py-2.5 text-zinc-900">{row.name}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{row.finished}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-700">{row.repaired}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-700">{row.notRepaired}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-700">{row.inProgress}</td>
                  <td className="px-5 py-2.5 text-right text-zinc-700">{formatDuration(row.averageRepairSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">Aún no hay equipos terminados en este periodo.</p>
      )}
    </section>
  );
}
