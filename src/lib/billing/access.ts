// Estado de acceso de un taller según su suscripción. Es puro (sin base de datos) para poder
// usarlo en la sesión, el panel administrativo y los componentes.

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type AccessState = "trial" | "grace" | "active" | "past_due" | "locked";

export type TenantAccess = {
  state: AccessState;
  // Días completos que faltan para el siguiente cambio de estado; null si no hay fecha límite.
  daysLeft: number | null;
  trialEndsAt: Date | null;
  // Fin de los días de gracia (de la prueba o del pago pendiente).
  graceEndsAt: Date | null;
  // Pagado hasta (Stripe) o fin del acceso si se canceló.
  paidUntil: Date | null;
};

export type SubscriptionFields = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  // Desde cuándo hay pago pendiente (se fija una vez al entrar en past_due). Pásalo siempre:
  // si falta, la gracia de un pago pendiente cuenta desde ahora y nunca se bloquea.
  pastDueSince?: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysUntil(date: Date, now: Date) {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

// Reglas:
// - trialing: prueba hasta trial_ends_at, luego gracia por grace_days y después bloqueo.
// - active: acceso normal (Stripe avisa si deja de pagarse).
// - past_due: como gracia hasta past_due_since + grace_days; después bloqueo.
// - canceled: acceso hasta current_period_end; después bloqueo.
export function computeAccess(subscription: SubscriptionFields, graceDays: number, now = new Date()): TenantAccess {
  const { status, trialEndsAt, currentPeriodEnd, pastDueSince } = subscription;
  const base = { trialEndsAt, graceEndsAt: null, paidUntil: currentPeriodEnd };

  if (status === "trialing") {
    // Sin fecha de fin (no debería pasar) se trata como prueba sin límite.
    if (!trialEndsAt) return { ...base, state: "trial", daysLeft: null };
    const graceEndsAt = addDays(trialEndsAt, graceDays);
    if (now < trialEndsAt) return { ...base, graceEndsAt, state: "trial", daysLeft: daysUntil(trialEndsAt, now) };
    if (now < graceEndsAt) return { ...base, graceEndsAt, state: "grace", daysLeft: daysUntil(graceEndsAt, now) };
    return { ...base, graceEndsAt, state: "locked", daysLeft: 0 };
  }

  if (status === "past_due") {
    // Sin fecha registrada (no debería pasar) la gracia cuenta desde hoy.
    const graceEndsAt = addDays(pastDueSince ?? now, graceDays);
    if (now < graceEndsAt) {
      return { ...base, graceEndsAt, state: "past_due", daysLeft: daysUntil(graceEndsAt, now) };
    }
    return { ...base, graceEndsAt, state: "locked", daysLeft: 0 };
  }

  if (status === "canceled") {
    if (currentPeriodEnd && now < currentPeriodEnd) {
      return { ...base, state: "active", daysLeft: daysUntil(currentPeriodEnd, now) };
    }
    return { ...base, state: "locked", daysLeft: 0 };
  }

  return { ...base, state: "active", daysLeft: currentPeriodEnd ? daysUntil(currentPeriodEnd, now) : null };
}

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

function days(count: number) {
  return count === 1 ? "1 día" : `${count} días`;
}

// Resumen corto para listados y encabezados.
export function describeAccess(access: TenantAccess, status: SubscriptionStatus) {
  switch (access.state) {
    case "trial":
      return access.daysLeft === null ? "Prueba gratuita" : `Prueba: quedan ${days(access.daysLeft)}`;
    case "grace":
      return `Prueba terminada: ${days(access.daysLeft ?? 0)} de gracia`;
    case "past_due":
      return `Pago pendiente: ${days(access.daysLeft ?? 0)} de gracia`;
    case "locked":
      return "Bloqueado por falta de pago";
    case "active":
      if (status === "canceled" && access.paidUntil) return `Cancelada: activa hasta el ${dateFormatter.format(access.paidUntil)}`;
      return access.paidUntil ? `Activa: próximo cobro el ${dateFormatter.format(access.paidUntil)}` : "Activa";
  }
}
