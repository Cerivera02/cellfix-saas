"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import type { SupplierInput } from "@/lib/inventory/core";

export function SupplierForm({
  action,
  defaults,
  submitLabel,
  onSuccess,
  onCancel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: SupplierInput;
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
  const value = (key: keyof SupplierInput) => state?.fields?.[key] ?? defaults?.[key];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nombre" name={`${id}-name`} error={state?.errors?.name}>
            <input
              id={`${id}-name`}
              name="name"
              type="text"
              autoComplete="off"
              required
              maxLength={120}
              defaultValue={value("name")}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Persona de contacto" name={`${id}-contact`}>
          <input
            id={`${id}-contact`}
            name="contactName"
            type="text"
            autoComplete="off"
            maxLength={120}
            defaultValue={value("contactName")}
            className={inputClass}
          />
        </Field>

        <Field label="Teléfono" name={`${id}-phone`}>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="off"
            maxLength={30}
            defaultValue={value("phone")}
            className={inputClass}
          />
        </Field>

        <Field label="Correo" name={`${id}-email`} error={state?.errors?.email}>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="off"
            maxLength={200}
            defaultValue={value("email")}
            className={inputClass}
          />
        </Field>

        <Field label="RFC" name={`${id}-tax`} hint="Opcional, para facturas.">
          <input
            id={`${id}-tax`}
            name="taxId"
            type="text"
            autoComplete="off"
            maxLength={20}
            defaultValue={value("taxId")}
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Dirección" name={`${id}-address`}>
            <textarea
              id={`${id}-address`}
              name="address"
              rows={2}
              maxLength={300}
              defaultValue={value("address")}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Notas" name={`${id}-notes`} hint="Días de entrega, condiciones de pago, etc.">
            <textarea
              id={`${id}-notes`}
              name="notes"
              rows={3}
              maxLength={1000}
              defaultValue={value("notes")}
              className={`${inputClass} resize-y`}
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
