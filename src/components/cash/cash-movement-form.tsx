"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { MoneyInput } from "@/components/ui/money-input";
import { Field, inputClass, primaryButtonClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";

const KIND_OPTIONS = [
  { value: "out", label: "Salida de efectivo" },
  { value: "in", label: "Entrada de efectivo" },
];

export function CashMovementForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <Field label="Tipo" name={`${id}-kind`} error={state?.errors?.kind}>
        <Select id={`${id}-kind`} name="kind" options={KIND_OPTIONS} defaultValue="out" />
      </Field>
      <Field label="Importe" name={`${id}-amount`} error={state?.errors?.amount}>
        <MoneyInput id={`${id}-amount`} name="amount" defaultValue={state?.success ? undefined : state?.fields?.amount} />
      </Field>
      <Field label="Motivo" name={`${id}-reason`} error={state?.errors?.reason} hint="Por ejemplo: pago de garrafón, cambio.">
        <input
          id={`${id}-reason`}
          name="reason"
          type="text"
          autoComplete="off"
          maxLength={200}
          defaultValue={state?.success ? undefined : state?.fields?.reason}
          className={inputClass}
        />
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
        {pending ? "Registrando…" : "Registrar"}
      </button>
    </form>
  );
}
