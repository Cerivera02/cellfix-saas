// Fechas sin hora ("2026-09-14"), como las columnas date de PostgreSQL leídas con ::text.
// Se tratan en UTC para que la zona horaria del servidor no mueva el día.

const dayFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" });

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(value: string) {
  if (!DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatDay(value: string) {
  return dayFormatter.format(new Date(`${value}T00:00:00Z`));
}

// Hoy en México ("2026-09-14"), para valores iniciales de <input type="date"> calculados en el servidor.
export function todayInMexico() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
