"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, ghostButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";

type WarrantyDefaults = { name: string; days: string };
type WarrantyAction = (state: FormState, formData: FormData) => Promise<FormState>;

function WarrantyForm({
  action,
  defaults,
  submitLabel,
  onDone,
}: {
  action: WarrantyAction;
  defaults?: WarrantyDefaults;
  submitLabel: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onDone();
    return result;
  }, undefined);
  const id = useId();
  const value = (key: keyof WarrantyDefaults) => state?.fields?.[key] ?? defaults?.[key];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Nombre" name={`${id}-name`} error={state?.errors?.name} hint="Así se muestra al entregar y en el ticket.">
          <input
            id={`${id}-name`}
            name="name"
            type="text"
            autoComplete="off"
            maxLength={60}
            placeholder="90 días"
            defaultValue={value("name")}
            className={inputClass}
          />
        </Field>
        <Field label="Días" name={`${id}-days`} error={state?.errors?.days}>
          <input
            id={`${id}-days`}
            name="days"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            defaultValue={value("days")}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      </div>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function WarrantyDialogButton({
  label,
  variant = "primary",
  title,
  action,
  defaults,
  submitLabel,
}: {
  label: string;
  variant?: "primary" | "ghost";
  title: string;
  action: WarrantyAction;
  defaults?: WarrantyDefaults;
  submitLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "primary" ? primaryButtonClass : ghostButtonClass}
      >
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {open && (
          <WarrantyForm action={action} defaults={defaults} submitLabel={submitLabel} onDone={() => setOpen(false)} />
        )}
      </Modal>
    </>
  );
}
