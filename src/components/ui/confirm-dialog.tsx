"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";

export type ConfirmTone = "danger" | "default";

// Separa "¿Archivar X? Ya no aparecerá…" en título (la pregunta) y detalle (el resto).
function splitMessage(message: string): { title: string; detail?: string } {
  const match = /^(¿[^?]*\?)\s*([\s\S]*)$/.exec(message.trim());
  if (!match) return { title: "¿Confirmar?", detail: message };
  return { title: match[1], detail: match[2] || undefined };
}

// Confirmación en ventana modal; sustituye al confirm nativo del navegador en toda la app.
// Se monta en <body> solo mientras está abierta para no romper el anidado del HTML.
export function ConfirmDialog({
  open,
  message,
  title,
  confirmLabel = "Confirmar",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  title?: string;
  confirmLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // En acciones destructivas el foco arranca en "Cancelar"; en las demás, en confirmar.
  useEffect(() => {
    if (open) (tone === "danger" ? cancelRef : confirmRef).current?.focus();
  }, [open, tone]);

  if (!open) return null;

  const parts = title ? { title, detail: message } : splitMessage(message);

  return createPortal(
    <Modal open onClose={onCancel} title={parts.title} description={parts.detail}>
      <div className="flex justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className={tone === "danger" ? dangerButtonClass : primaryButtonClass}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>,
    document.body,
  );
}
