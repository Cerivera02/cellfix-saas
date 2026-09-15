"use client";

import { useActionState, useId } from "react";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";

export function SetPasswordForm({
  action,
  onDone,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const inputId = useId();

  if (state?.success) {
    return (
      <div className="flex flex-col gap-4">
        <p aria-live="polite" className="text-sm text-emerald-600">
          {state.success}
        </p>
        <button type="button" onClick={onDone} className={`self-end ${primaryButtonClass}`}>
          Listo
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Nueva contraseña" name={inputId} error={state?.errors?.password} hint="Mínimo 8 caracteres.">
        <input
          id={inputId}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </Field>

      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {state?.message}
      </p>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
