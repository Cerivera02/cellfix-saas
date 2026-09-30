"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Modal } from "@/components/ui/modal";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { AccessState } from "@/lib/billing/access";

const BILLING_PATH = "/dashboard/suscripcion";

function days(count: number) {
  return count === 1 ? "1 día" : `${count} días`;
}

// Línea discreta en el menú lateral: días de prueba, de gracia o pago pendiente.
export function SubscriptionLine({
  state,
  daysLeft,
  canManage,
}: {
  state: AccessState;
  daysLeft: number | null;
  canManage: boolean;
}) {
  // Solo le importa a quien paga; el resto del equipo no ve avisos de cobro en el menú.
  if (!canManage) return null;

  let text: string;
  if (state === "trial") text = daysLeft === null ? "Prueba gratuita" : `Prueba gratuita: quedan ${days(daysLeft)}`;
  else if (state === "grace") text = `Prueba terminada: ${days(daysLeft ?? 0)} para elegir plan`;
  else if (state === "past_due") text = `Pago pendiente: ${days(daysLeft ?? 0)} para actualizarlo`;
  else return null;

  return (
    <p className="text-xs leading-relaxed text-zinc-500">
      {text}.{" "}
      <Link href={BILLING_PATH} className="font-medium text-zinc-900 hover:underline">
        {state === "past_due" ? "Actualizar pago" : "Elegir plan"}
      </Link>
    </p>
  );
}

// "Ya lo vio en esta sesión del navegador", en sessionStorage.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function wasSeen(key: string) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Sin almacenamiento el aviso vuelve a salir en la siguiente carga; no es grave.
  }
  listeners.forEach((listener) => listener());
}

// Ventana que aparece una vez por sesión del navegador cuando terminó la prueba o hay un pago
// pendiente. El sistema sigue funcionando; solo invita a elegir plan.
export function GraceModal({
  tenantId,
  state,
  daysLeft,
  canManage,
}: {
  tenantId: string;
  state: "grace" | "past_due";
  daysLeft: number;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const key = `cellfix:aviso-suscripcion:${tenantId}:${state}`;
  // En el servidor se da por visto para no pintar la ventana antes de leer sessionStorage.
  const seen = useSyncExternalStore(
    subscribe,
    () => wasSeen(key),
    () => true,
  );

  if (seen || pathname.startsWith(BILLING_PATH)) return null;

  const close = () => markSeen(key);
  const remaining = `Te quedan ${days(daysLeft)} antes de que se pause el acceso.`;

  const title = state === "grace" ? "Tu prueba gratuita terminó" : "No pudimos cobrar tu suscripción";
  const body =
    state === "grace"
      ? canManage
        ? "¿Te gustó CellFix? Elige los módulos que quieres y activa tu suscripción para seguir usándolo."
        : "Para seguir usando CellFix, el propietario del taller debe elegir un plan."
      : canManage
        ? "Actualiza tu forma de pago para seguir usando CellFix sin interrupciones."
        : "El propietario del taller debe actualizar la forma de pago para seguir usando CellFix.";

  return (
    <Modal open onClose={close} title={title}>
      <p className="text-sm text-zinc-600">{body}</p>
      <p className="mt-2 text-sm text-zinc-500">{remaining}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {canManage ? (
          <>
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Más tarde
            </button>
            <Link href={BILLING_PATH} onClick={close} className={primaryButtonClass}>
              {state === "grace" ? "Elegir plan" : "Actualizar pago"}
            </Link>
          </>
        ) : (
          <button type="button" onClick={close} className={primaryButtonClass}>
            Entendido
          </button>
        )}
      </div>
    </Modal>
  );
}
