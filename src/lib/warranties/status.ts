import { todayInMexico } from "@/lib/dates";

// Vigencia de la garantía de un equipo entregado, contada en días de México: la garantía cubre
// desde el día de la entrega hasta ese día más los días de la garantía (inclusive).

const longDayFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });
const mexicoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });

export type WarrantyStatus = {
  label: string;
  // Último día cubierto, ya con formato ("12 de diciembre de 2026").
  until: string;
  // Días que faltan contando desde hoy; 0 = hoy es el último día. Negativo si ya terminó.
  remainingDays: number;
  active: boolean;
};

function dayNumber(day: string) {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

// null si no aplica: sin entregar, sin reparación o sin días de garantía.
export function getWarrantyStatus(
  order: { outcome: string | null; deliveredAt: Date | null; warrantyDays: number; warrantyName: string | null },
  today: string = todayInMexico(),
): WarrantyStatus | null {
  if (order.outcome !== "repaired" || !order.deliveredAt || order.warrantyDays <= 0) return null;
  const endNumber = dayNumber(mexicoDay.format(order.deliveredAt)) + order.warrantyDays;
  const remainingDays = endNumber - dayNumber(today);
  return {
    label: order.warrantyName ?? `${order.warrantyDays} días`,
    until: longDayFormatter.format(new Date(endNumber * 86_400_000)),
    remainingDays,
    active: remainingDays >= 0,
  };
}

// Texto de lo que queda, para el cliente ("te quedan 57 días (hasta el 12 de diciembre de 2026)")
// o para el taller ("quedan 57 días …").
export function describeWarrantyRemaining(status: WarrantyStatus, audience: "customer" | "staff") {
  if (!status.active) return `terminó el ${status.until}`;
  if (status.remainingDays === 0) return `hoy es el último día (${status.until})`;
  const verb = audience === "customer" ? "te qued" : "qued";
  const days = status.remainingDays === 1 ? `${verb}a 1 día` : `${verb}an ${status.remainingDays} días`;
  return `${days} (hasta el ${status.until})`;
}
