"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, ghostButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { SelectOption } from "@/components/ui/select";
import { quickCreateCustomerAction, type QuickCustomerState } from "@/lib/customers/actions";

function QuickCustomerForm({ onCreated, onCancel }: { onCreated: (customer: SelectOption) => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(async (prevState: QuickCustomerState, formData: FormData) => {
    const result = await quickCreateCustomerAction(prevState, formData);
    if (result?.customer) onCreated(result.customer);
    return result;
  }, undefined);
  const id = useId();
  const fields = state?.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name={`${id}-first`} error={state?.errors?.firstName}>
          <input
            id={`${id}-first`}
            name="firstName"
            type="text"
            autoComplete="off"
            required
            maxLength={80}
            placeholder="María"
            defaultValue={fields.firstName}
            className={inputClass}
          />
        </Field>
        <Field label="Apellidos" name={`${id}-last`}>
          <input
            id={`${id}-last`}
            name="lastName"
            type="text"
            autoComplete="off"
            maxLength={120}
            placeholder="López Hernández"
            defaultValue={fields.lastName}
            className={inputClass}
          />
        </Field>
        <Field label="Teléfono" name={`${id}-phone`} error={state?.errors?.phone}>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="off"
            maxLength={30}
            placeholder="55 1234 5678"
            defaultValue={fields.phone}
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
            placeholder="cliente@correo.com"
            defaultValue={fields.email}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="-mt-1 text-xs text-zinc-500">Al menos teléfono o correo, para contactarlo por garantías.</p>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Registrando…" : "Registrar cliente"}
        </button>
      </div>
    </form>
  );
}

export function CustomerQuickDialog({ onCreated }: { onCreated: (customer: SelectOption) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={ghostButtonClass}>
        + Nuevo cliente
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo cliente"
        description="Datos básicos; los de facturación se agregan después desde Clientes."
      >
        {open && (
          <QuickCustomerForm
            onCreated={(customer) => {
              onCreated(customer);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
