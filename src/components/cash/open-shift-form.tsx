"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { MoneyInput } from "@/components/ui/money-input";
import { Field, primaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";

export function OpenShiftForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3 text-left" noValidate>
      <Field
        label="Fondo inicial"
        name={`${id}-opening`}
        error={state?.errors?.openingAmount}
        hint="Efectivo con el que empieza la caja."
      >
        <MoneyInput id={`${id}-opening`} name="openingAmount" defaultValue={state?.fields?.openingAmount} />
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Abriendo…" : "Abrir caja"}
      </button>
    </form>
  );
}
