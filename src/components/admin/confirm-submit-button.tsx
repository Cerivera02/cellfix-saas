"use client";

import { Children, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog, type ConfirmTone } from "@/components/ui/confirm-dialog";

// Texto plano de los hijos del botón ("Archivar", "Borrar"…), para rotular la confirmación.
function plainText(node: React.ReactNode): string {
  return Children.toArray(node)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("")
    .trim();
}

// Botón de envío que, si recibe `message`, pide confirmación en una ventana antes de enviar el
// formulario. Al confirmar usa requestSubmit para que la server action y su estado pendiente
// funcionen igual que con un clic normal.
export function ConfirmSubmitButton({
  message,
  title,
  confirmLabel,
  tone = "danger",
  className,
  children,
}: {
  message?: string;
  title?: string;
  confirmLabel?: string;
  tone?: ConfirmTone;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        disabled={pending}
        className={className}
        onClick={(event) => {
          if (!message) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </button>
      {message && (
        <ConfirmDialog
          open={open}
          message={message}
          title={title}
          confirmLabel={confirmLabel ?? (plainText(children) || "Confirmar")}
          tone={tone}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            const button = buttonRef.current;
            button?.form?.requestSubmit(button);
          }}
        />
      )}
    </>
  );
}
