import type { Permission } from "@/lib/permissions";

// Estados, transiciones y catálogos de las órdenes de reparación (sin dependencias de servidor).

export const ORDER_STATUSES = [
  "received",
  "diagnosing",
  "awaiting_approval",
  "waiting_parts",
  "in_repair",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  received: "Recibido",
  diagnosing: "En diagnóstico",
  awaiting_approval: "Esperando autorización",
  waiting_parts: "Esperando refacción",
  in_repair: "En reparación",
  ready: "Listo para entregar",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const ACTIVE_ORDER_STATUSES = ORDER_STATUSES.filter(
  (status) => status !== "delivered" && status !== "cancelled",
);

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isActiveStatus(status: OrderStatus) {
  return status !== "delivered" && status !== "cancelled";
}

// Cambios de estado durante el trabajo. Entregar y cancelar tienen su propio flujo.
export const WORK_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ["diagnosing"],
  diagnosing: ["awaiting_approval", "waiting_parts", "in_repair", "ready"],
  awaiting_approval: ["waiting_parts", "in_repair", "ready"],
  waiting_parts: ["in_repair", "ready"],
  in_repair: ["waiting_parts", "ready"],
  ready: ["in_repair"],
  delivered: [],
  cancelled: [],
};

// Vistas del listado de órdenes.
export const ORDER_VIEWS = ["active", "unassigned", "mine", "ready", "delivered", "cancelled"] as const;

export type OrderView = (typeof ORDER_VIEWS)[number];

export const ORDER_VIEW_LABELS: Record<OrderView, string> = {
  active: "En proceso",
  unassigned: "Por tomar",
  mine: "Mis órdenes",
  ready: "Listas para entregar",
  delivered: "Entregadas",
  cancelled: "Canceladas",
};

export function isOrderView(value: string): value is OrderView {
  return (ORDER_VIEWS as readonly string[]).includes(value);
}

export const ORDER_OUTCOMES = ["repaired", "not_repaired"] as const;

export type OrderOutcome = (typeof ORDER_OUTCOMES)[number];

export const ORDER_OUTCOME_LABELS: Record<OrderOutcome, string> = {
  repaired: "Reparado",
  not_repaired: "Sin reparación",
};

// Tipo de ingreso al recibir el equipo: define el anticipo que se pide.
export const INTAKE_TYPES = ["in_stock", "order_part", "diagnosis"] as const;

export type IntakeType = (typeof INTAKE_TYPES)[number];

export const INTAKE_TYPE_LABELS: Record<IntakeType, string> = {
  in_stock: "Refacción en existencia",
  order_part: "Refacción por conseguir",
  diagnosis: "Diagnóstico",
};

export const INTAKE_TYPE_HINTS: Record<IntakeType, string> = {
  in_stock: "Se pide anticipo para apartar la reparación.",
  order_part: "Se sugiere un anticipo para pedir la pieza.",
  diagnosis: "Se desconoce la falla; el diagnóstico se cobra al recibir.",
};

export function isIntakeType(value: string): value is IntakeType {
  return (INTAKE_TYPES as readonly string[]).includes(value);
}

export type OrderPaymentKind = "deposit" | "payment" | "refund";

export const ORDER_PAYMENT_KIND_LABELS: Record<OrderPaymentKind, string> = {
  deposit: "Anticipo",
  payment: "Pago al entregar",
  refund: "Reembolso",
};

export const DEVICE_TYPES = [
  "Teléfono",
  "Tablet",
  "Laptop",
  "Computadora",
  "Televisión",
  "Consola",
  "Reloj inteligente",
  "Teclado",
  "Componente",
  "Otro",
];

export const LABOR_TAX_RATES = ["16", "8", "0"];

export const DIAGNOSIS_LINE_DESCRIPTION = "Diagnóstico";

// Desbloqueo del equipo. El patrón se guarda como la secuencia de puntos de una cuadrícula 3×3,
// numerados de izquierda a derecha y de arriba abajo: "1-5-9-6".
export const UNLOCK_TYPES = ["none", "pin", "password", "pattern"] as const;

export type UnlockType = (typeof UNLOCK_TYPES)[number];

export const UNLOCK_TYPE_LABELS: Record<UnlockType, string> = {
  none: "Sin bloqueo",
  pin: "PIN",
  password: "Contraseña",
  pattern: "Patrón",
};

export function isUnlockType(value: string): value is UnlockType {
  return (UNLOCK_TYPES as readonly string[]).includes(value);
}

// "1-5-9-6" → [1, 5, 9, 6]. null si no es un patrón válido (4 a 9 puntos, sin repetir).
export function parsePattern(code: string): number[] | null {
  if (!/^[1-9](-[1-9]){3,8}$/.test(code)) return null;
  const dots = code.split("-").map(Number);
  return new Set(dots).size === dots.length ? dots : null;
}

// Quien tenga alguno de estos permisos puede entrar a Órdenes.
export const ORDER_ACCESS_PERMISSIONS: Permission[] = [
  "orders.view",
  "orders.intake",
  "orders.deliver",
  "repairs.work",
  "payments.collect",
];

// Precios, presupuestos y cobros de órdenes: los ve quien tiene el permiso o cobra; los técnicos no.
export function canSeeOrderPrices(permissions: readonly Permission[]) {
  return permissions.includes("orders.prices") || permissions.includes("payments.collect");
}

export function describeDevice(order: { deviceType: string; brand: string; model: string }) {
  return [order.deviceType, order.brand, order.model].filter(Boolean).join(" ");
}
