import "server-only";
import type { PoolClient } from "pg";
import { fromCents, toCents } from "@/lib/cash/money";
import { withTenantDb } from "@/lib/tenancy/db";

// Estadísticas del taller para el panel del propietario (permiso reports.view).
// No verifica la sesión: la página que llama ya comprobó el permiso.
// Los cortes de mes y semana se calculan en hora de México.

const TIME_ZONE = "America/Mexico_City";

export type ProductivityPeriod = "week" | "month";

export type MonthSummary = {
  // Inicio del mes actual (en hora de México), para el título.
  monthStart: Date;
  // Mes a la fecha y el mismo tramo del mes anterior.
  income: string;
  previousIncome: string;
  // Variación porcentual; null si el periodo anterior no tuvo ingresos.
  incomeChange: number | null;
  received: number;
  delivered: number;
  previousDelivered: number;
  deliveredChange: number | null;
  deliveredRepaired: number;
  deliveredNotRepaired: number;
  // Promedio del total de las órdenes entregadas en el mes (sin contar las de total 0).
  averageTicket: string | null;
};

export type TechnicianProductivity = {
  technicianId: string | null;
  name: string;
  finished: number;
  repaired: number;
  notRepaired: number;
  inProgress: number;
  // Promedio en segundos desde que se tomó el equipo hasta que quedó listo.
  averageRepairSeconds: number | null;
};

function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

// Mes a la fecha (inicio del mes → ahora) contra el mismo tramo del mes anterior, sin pasarse
// del fin de ese mes (p. ej. el 31 de marzo se compara contra todo febrero).
const MONTH_BOUNDS = `
  SELECT local.month_start AT TIME ZONE '${TIME_ZONE}' AS cur_start,
         $1::timestamptz AS cur_end,
         (local.month_start - interval '1 month') AT TIME ZONE '${TIME_ZONE}' AS prev_start,
         LEAST((local.month_start - interval '1 month' + (local.local_now - local.month_start)) AT TIME ZONE '${TIME_ZONE}',
               local.month_start AT TIME ZONE '${TIME_ZONE}') AS prev_end
    FROM (SELECT $1::timestamptz AT TIME ZONE '${TIME_ZONE}' AS local_now,
                 date_trunc('month', $1::timestamptz AT TIME ZONE '${TIME_ZONE}') AS month_start) local`;

async function queryMonthSummary(client: PoolClient, now: Date): Promise<MonthSummary> {
  const { rows } = await client.query<{
    cur_start: Date;
    order_income: string;
    prev_order_income: string;
    sales_income: string;
    prev_sales_income: string;
    returns_total: string;
    prev_returns_total: string;
    received: number;
    delivered: number;
    prev_delivered: number;
    delivered_repaired: number;
    delivered_not_repaired: number;
    average_ticket: string | null;
  }>(
    `WITH b AS (${MONTH_BOUNDS}),
     pay AS (
       -- Anticipos y pagos de órdenes menos reembolsos, con o sin turno de caja.
       SELECT COALESCE(sum(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
                         FILTER (WHERE p.created_at >= b.cur_start), 0) AS cur,
              COALESCE(sum(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
                         FILTER (WHERE p.created_at < b.prev_end), 0) AS prev
         FROM repair_order_payments p, b
        WHERE p.created_at >= b.prev_start AND p.created_at < b.cur_end
     ),
     sal AS (
       -- El total de la venta es exactamente lo cobrado (los pagos deben cubrirlo).
       SELECT COALESCE(sum(s.total) FILTER (WHERE s.created_at >= b.cur_start), 0) AS cur,
              COALESCE(sum(s.total) FILTER (WHERE s.created_at < b.prev_end), 0) AS prev
         FROM sales s, b
        WHERE s.created_at >= b.prev_start AND s.created_at < b.cur_end
     ),
     ret AS (
       -- Devoluciones de ventas, en la fecha en que se reembolsaron.
       SELECT COALESCE(sum(r.refund_total) FILTER (WHERE r.created_at >= b.cur_start), 0) AS cur,
              COALESCE(sum(r.refund_total) FILTER (WHERE r.created_at < b.prev_end), 0) AS prev
         FROM sale_returns r, b
        WHERE r.created_at >= b.prev_start AND r.created_at < b.cur_end
     ),
     rec AS (
       SELECT count(*)::int AS cur
         FROM repair_orders o, b
        WHERE o.created_at >= b.cur_start AND o.created_at < b.cur_end
     ),
     del AS (
       SELECT count(*) FILTER (WHERE o.delivered_at >= b.cur_start)::int AS cur,
              count(*) FILTER (WHERE o.delivered_at >= b.cur_start AND o.outcome = 'repaired')::int AS cur_repaired,
              count(*) FILTER (WHERE o.delivered_at >= b.cur_start AND o.outcome = 'not_repaired')::int AS cur_not_repaired,
              count(*) FILTER (WHERE o.delivered_at < b.prev_end)::int AS prev
         FROM repair_orders o, b
        WHERE o.delivered_at >= b.prev_start AND o.delivered_at < b.cur_end
     ),
     ticket AS (
       SELECT round(avg(t.total), 2) AS average
         FROM (SELECT sum(l.total) AS total
                 FROM repair_orders o
                 JOIN repair_order_lines l ON l.order_id = o.id
                 CROSS JOIN b
                WHERE o.delivered_at >= b.cur_start AND o.delivered_at < b.cur_end
                GROUP BY o.id
               HAVING sum(l.total) > 0) t
     )
     SELECT b.cur_start,
            pay.cur AS order_income, pay.prev AS prev_order_income,
            sal.cur AS sales_income, sal.prev AS prev_sales_income,
            ret.cur AS returns_total, ret.prev AS prev_returns_total,
            rec.cur AS received,
            del.cur AS delivered, del.prev AS prev_delivered,
            del.cur_repaired AS delivered_repaired, del.cur_not_repaired AS delivered_not_repaired,
            ticket.average AS average_ticket
       FROM b, pay, sal, ret, rec, del, ticket`,
    [now],
  );
  const row = rows[0];

  const income = toCents(row.order_income) + toCents(row.sales_income) - toCents(row.returns_total);
  const previousIncome = toCents(row.prev_order_income) + toCents(row.prev_sales_income) - toCents(row.prev_returns_total);

  return {
    monthStart: row.cur_start,
    income: fromCents(income),
    previousIncome: fromCents(previousIncome),
    incomeChange: percentChange(income, previousIncome),
    received: row.received,
    delivered: row.delivered,
    previousDelivered: row.prev_delivered,
    deliveredChange: percentChange(row.delivered, row.prev_delivered),
    deliveredRepaired: row.delivered_repaired,
    deliveredNotRepaired: row.delivered_not_repaired,
    averageTicket: row.average_ticket === null ? null : fromCents(toCents(row.average_ticket)),
  };
}

async function queryTechnicianProductivity(
  client: PoolClient,
  period: ProductivityPeriod,
  now: Date,
): Promise<TechnicianProductivity[]> {
  // Terminados: órdenes cuya PRIMERA vez en "Listo para entregar" cae en el periodo y que siguen
  // listas o ya se entregaron (si se regresó a reparación todavía no cuenta). Se acreditan al
  // técnico asignado. El tiempo va de que se tomó el equipo (asignación o diagnóstico) a que
  // quedó listo; sin ese evento, desde que se recibió.
  const { rows: finishedRows } = await client.query<{
    technician_id: string | null;
    name: string;
    finished: number;
    repaired: number;
    not_repaired: number;
    average_seconds: number | null;
  }>(
    `WITH b AS (
       SELECT date_trunc($2, $1::timestamptz AT TIME ZONE '${TIME_ZONE}') AT TIME ZONE '${TIME_ZONE}' AS start
     ),
     first_ready AS (
       SELECT e.order_id, min(e.created_at) AS ready_at
         FROM repair_order_events e, b
        WHERE e.status = 'ready' AND e.created_at >= b.start AND e.created_at < $1
          AND NOT EXISTS (SELECT 1 FROM repair_order_events x
                           WHERE x.order_id = e.order_id AND x.status = 'ready' AND x.created_at < b.start)
        GROUP BY e.order_id
     ),
     done AS (
       SELECT o.technician_id, o.technician_name, o.outcome, f.ready_at,
              COALESCE((SELECT min(s.created_at) FROM repair_order_events s
                         WHERE s.order_id = o.id AND s.created_at <= f.ready_at
                           AND (s.status = 'diagnosing' OR s.note LIKE 'Asignada a %')), o.created_at) AS started_at
         FROM first_ready f
         JOIN repair_orders o ON o.id = f.order_id
        WHERE o.status IN ('ready', 'delivered')
     )
     SELECT d.technician_id, COALESCE(u.name, max(d.technician_name), '') AS name,
            count(*)::int AS finished,
            count(*) FILTER (WHERE d.outcome = 'repaired')::int AS repaired,
            count(*) FILTER (WHERE d.outcome = 'not_repaired')::int AS not_repaired,
            avg(extract(epoch FROM d.ready_at - d.started_at))::float8 AS average_seconds
       FROM done d
       LEFT JOIN public.users u ON u.id = d.technician_id
      GROUP BY d.technician_id, u.name, CASE WHEN d.technician_id IS NULL THEN d.technician_name END`,
    [now, period],
  );

  // En proceso: órdenes activas asignadas que aún no están listas.
  const { rows: activeRows } = await client.query<{ technician_id: string; name: string; in_progress: number }>(
    `SELECT o.technician_id, COALESCE(u.name, max(o.technician_name)) AS name, count(*)::int AS in_progress
       FROM repair_orders o
       LEFT JOIN public.users u ON u.id = o.technician_id
      WHERE o.status IN ('received', 'diagnosing', 'awaiting_approval', 'waiting_parts', 'in_repair')
        AND o.technician_id IS NOT NULL
      GROUP BY o.technician_id, u.name`,
  );

  const result: TechnicianProductivity[] = finishedRows.map((row) => ({
    technicianId: row.technician_id,
    name: row.name || "Sin nombre",
    finished: row.finished,
    repaired: row.repaired,
    notRepaired: row.not_repaired,
    inProgress: 0,
    averageRepairSeconds: row.average_seconds,
  }));
  for (const row of activeRows) {
    const existing = result.find((entry) => entry.technicianId === row.technician_id);
    if (existing) {
      existing.inProgress = row.in_progress;
    } else {
      result.push({
        technicianId: row.technician_id,
        name: row.name || "Sin nombre",
        finished: 0,
        repaired: 0,
        notRepaired: 0,
        inProgress: row.in_progress,
        averageRepairSeconds: null,
      });
    }
  }

  return result.sort(
    (a, b) => b.finished - a.finished || b.inProgress - a.inProgress || a.name.localeCompare(b.name, "es"),
  );
}

export async function getMonthSummary(tenantId: string, now: Date) {
  return withTenantDb(tenantId, (client) => queryMonthSummary(client, now));
}

export async function getTechnicianProductivity(tenantId: string, period: ProductivityPeriod, now: Date) {
  return withTenantDb(tenantId, (client) => queryTechnicianProductivity(client, period, now));
}

// Ambos reportes con una sola conexión, para el panel de inicio.
export async function getOwnerReports(tenantId: string, period: ProductivityPeriod, now: Date) {
  return withTenantDb(tenantId, async (client) => ({
    month: await queryMonthSummary(client, now),
    technicians: await queryTechnicianProductivity(client, period, now),
  }));
}
