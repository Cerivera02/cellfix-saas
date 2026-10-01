import { useSyncExternalStore } from "react";

// Marcas "ya lo vio en esta sesión del navegador" en sessionStorage, compartidas entre ventanas
// para que una pueda esperar a que se cierre otra. Solo para componentes cliente.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readFlag(key: string) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Sin almacenamiento la ventana vuelve a salir en la siguiente carga; no es grave.
  }
  listeners.forEach((listener) => listener());
}

// En el servidor devuelve `serverValue`; conviene `true` para no pintar una ventana antes de leer
// sessionStorage. Con `key` en null siempre es true.
export function useSessionFlag(key: string | null, serverValue = true) {
  return useSyncExternalStore(
    subscribe,
    () => (key === null ? true : readFlag(key)),
    () => (key === null ? true : serverValue),
  );
}

// Aviso de prueba terminada o pago pendiente (GraceModal).
export function graceNoticeKey(tenantId: string, state: "grace" | "past_due") {
  return `cellfix:aviso-suscripcion:${tenantId}:${state}`;
}
