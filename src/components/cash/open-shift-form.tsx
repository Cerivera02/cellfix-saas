"use client";

import { useActionState, useEffect, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { MoneyInput } from "@/components/ui/money-input";
import { Field, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { openShiftAction } from "@/lib/cash/actions";
import type { FormState } from "@/lib/form-state";

// Apertura de caja con el fondo inicial. Se usa en Vender, en Cortes de caja y en la ventana
// "Abrir caja" del panel (que pasa `onCancel` y `onSuccess`).
export function OpenShiftForm({
  onCancel,
  onSuccess,
  autoFocus,
}: {
  onCancel?: () => void;
  onSuccess?: () => void;
  autoFocus?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await openShiftAction(prevState, formData);
    if (result?.success) onSuccess?.();
    return result;
  }, undefined);
  const id = useId();

  // Dentro de una ventana el navegador enfoca el primer botón; aquí se lleva el foco al importe.
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => document.getElementById(`${id}-opening`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, id]);

  return (
    <form action={formAction} className="flex flex-col gap-3 text-left" noValidate>
      <Field
        label="Fondo inicial"
        name={`${id}-opening`}
        error={state?.errors?.openingAmount}
        hint="Efectivo con el que empieza la caja."
      >
        <MoneyInput
          id={`${id}-opening`}
          name="openingAmount"
          defaultValue={state?.fields?.openingAmount}
        />
      </Field>
      <FormMessage state={state} />
      {onCancel ? (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Ahora no
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Abriendo…" : "Abrir caja"}
          </button>
        </div>
      ) : (
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Abriendo…" : "Abrir caja"}
        </button>
      )}
    </form>
  );
}
