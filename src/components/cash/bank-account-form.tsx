"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { BankAccountInput } from "@/lib/cash/core";
import type { FormState } from "@/lib/form-state";

export function BankAccountForm({
  action,
  defaults,
  submitLabel,
  onSuccess,
  onCancel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: BankAccountInput;
  submitLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onSuccess();
    return result;
  }, undefined);
  const id = useId();
  const value = (key: keyof BankAccountInput) => state?.fields?.[key] ?? defaults?.[key];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Banco" name={`${id}-bank`} error={state?.errors?.bankName}>
          <input
            id={`${id}-bank`}
            name="bankName"
            type="text"
            autoComplete="off"
            maxLength={60}
            placeholder="BBVA, Banorte…"
            defaultValue={value("bankName")}
            className={inputClass}
          />
        </Field>

        <Field label="Alias" name={`${id}-alias`} hint="Opcional: para distinguir cuentas del mismo banco.">
          <input
            id={`${id}-alias`}
            name="alias"
            type="text"
            autoComplete="off"
            maxLength={60}
            defaultValue={value("alias")}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Nombre del titular" name={`${id}-holder`} error={state?.errors?.holderName}>
            <input
              id={`${id}-holder`}
              name="holderName"
              type="text"
              autoComplete="off"
              maxLength={120}
              defaultValue={value("holderName")}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="CLABE" name={`${id}-clabe`} error={state?.errors?.clabe} hint="18 dígitos; se verifica el dígito de control.">
            <input
              id={`${id}-clabe`}
              name="clabe"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={24}
              defaultValue={value("clabe")}
              className={`${inputClass} font-mono tracking-wide`}
            />
          </Field>
        </div>
      </div>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
