"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";

// Botón que abre una ventana modal. El contenido se monta al abrir (estado limpio cada vez)
// y recibe `close` para cerrarla al terminar.
export function DialogButton({
  label,
  className,
  title,
  description,
  size,
  children,
}: {
  label: string;
  className: string;
  title: string;
  description?: string;
  size?: "md" | "lg";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} size={size}>
        {open && children(() => setOpen(false))}
      </Modal>
    </>
  );
}

// useActionState que cierra la ventana cuando la acción responde con éxito.
export function useDialogAction(
  action: (state: FormState, formData: FormData) => Promise<FormState>,
  onDone: () => void,
) {
  return useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onDone();
    return result;
  }, undefined);
}
