"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";

// Botón de una sola acción (sin campos) que muestra el error debajo si la acción falla.
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  className,
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel: string;
  confirm?: string;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(() => action(), undefined);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <button type="submit" disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
      {state?.message && <p className="mt-1 max-w-48 text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
