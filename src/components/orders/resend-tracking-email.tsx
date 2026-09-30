"use client";

import { useActionState } from "react";
import { ghostButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";

// Reenvía el enlace de seguimiento al correo del cliente; el resultado se muestra en línea.
export function ResendTrackingEmail({ action }: { action: () => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(() => action(), undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-x-2">
      <button type="submit" disabled={pending} className={ghostButtonClass}>
        {pending ? "Enviando…" : "Reenviar enlace por correo"}
      </button>
      {!pending && (state?.success || state?.message) && (
        <p aria-live="polite" className={`text-xs ${state.message ? "text-red-600" : "text-zinc-500"}`}>
          {state.message ?? state.success}
        </p>
      )}
    </form>
  );
}
