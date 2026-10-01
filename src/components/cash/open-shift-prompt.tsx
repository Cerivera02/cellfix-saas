"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { OpenShiftForm } from "@/components/cash/open-shift-form";
import { primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { graceNoticeKey, setSessionFlag, useSessionFlag } from "@/components/ui/session-flag";

// Ventana "Abrir caja" del panel. Sale sola al entrar si la caja está cerrada y el usuario puede
// abrirla; también la abren el botón del inicio y el aviso "Abre la caja…" de los cobros.

// Rutas donde no sale sola: Caja ya tiene su propio formulario de apertura.
const SKIPPED_PREFIXES = ["/dashboard/cash", "/dashboard/suscripcion"];

type OpenShiftPrompt = { open: () => void };

const PromptContext = createContext<OpenShiftPrompt | null>(null);

// null si el usuario no puede abrir la caja (sin permiso o sin el módulo).
export function useOpenShiftPrompt() {
  return useContext(PromptContext);
}

export function OpenShiftPromptProvider({
  tenantId,
  userId,
  canOperate,
  needsOpenShift,
  graceState,
  children,
}: {
  tenantId: string;
  // La marca de "Ahora no" es por usuario: en una computadora compartida del mostrador, que el
  // dueño la descarte no debe ocultársela a la recepcionista.
  userId: string;
  canOperate: boolean;
  needsOpenShift: boolean;
  // Si hoy sale el aviso de suscripción, esta ventana espera a que se cierre para no encimarse.
  graceState: "grace" | "past_due" | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [manualOpen, setManualOpen] = useState(false);
  const dismissKey = `cellfix:abrir-caja:${tenantId}:${userId}`;
  const dismissed = useSessionFlag(dismissKey);
  const graceSeen = useSessionFlag(graceState ? graceNoticeKey(tenantId, graceState) : null, false);

  const autoOpen =
    canOperate &&
    needsOpenShift &&
    !dismissed &&
    graceSeen &&
    !SKIPPED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const open = canOperate && (manualOpen || autoOpen);

  // Cerrar (Ahora no, Escape o clic fuera) la oculta por el resto de la sesión del navegador.
  const close = () => {
    setManualOpen(false);
    setSessionFlag(dismissKey);
  };

  return (
    <PromptContext.Provider value={canOperate ? { open: () => setManualOpen(true) } : null}>
      {children}
      {canOperate && (
        <Modal
          open={open}
          onClose={close}
          title="Abrir caja"
          description="Captura el efectivo con el que empiezas para poder cobrar entregas y ventas."
        >
          {/* Al abrirse, la acción refresca el panel y needsOpenShift pasa a false. */}
          {open && <OpenShiftForm autoFocus onCancel={close} onSuccess={() => setManualOpen(false)} />}
        </Modal>
      )}
    </PromptContext.Provider>
  );
}

// Botón que abre la ventana; no pinta nada si el usuario no puede abrir la caja.
export function OpenShiftButton({ className = primaryButtonClass }: { className?: string }) {
  const prompt = useOpenShiftPrompt();
  if (!prompt) return null;
  return (
    <button type="button" onClick={prompt.open} className={className}>
      Abrir caja
    </button>
  );
}

// Para los cobros que fallan con "Abre la caja…": ofrece abrirla ahí mismo, sin salir de la ventana.
export function OpenShiftHint({ message }: { message: string | null | undefined }) {
  const prompt = useOpenShiftPrompt();
  if (!prompt || !message?.startsWith("Abre la caja")) return null;
  return (
    <button type="button" onClick={prompt.open} className="ml-1 font-medium text-zinc-900 underline">
      Abrir caja
    </button>
  );
}
