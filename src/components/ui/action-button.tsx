"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import type { ConfirmTone } from "@/components/ui/confirm-dialog";
import type { FormState } from "@/lib/form-state";

// Botón de una sola acción (sin campos) que muestra el error debajo si la acción falla.
// Con `confirm` pide confirmación en una ventana antes de ejecutarla.
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  confirmTone,
  className,
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel: string;
  confirm?: string;
  confirmTone?: ConfirmTone;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(() => action(), undefined);

  return (
    <form action={formAction}>
      <ConfirmSubmitButton message={confirm} confirmLabel={label} tone={confirmTone} className={className}>
        {pending ? pendingLabel : label}
      </ConfirmSubmitButton>
      {state?.message && <p className="mt-1 max-w-48 text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
