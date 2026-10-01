"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createTenantAction } from "@/lib/admin/actions";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";

export function CreateTenantForm() {
  const [state, formAction, pending] = useActionState(createTenantAction, undefined);
  const fields = state?.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-900">Taller</h2>
        <Field label="Nombre del taller" name="name" error={state?.errors?.name}>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="off"
            required
            placeholder="Ej. Reparación Chávez"
            defaultValue={fields.name}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4 border-t border-zinc-100 pt-6">
        <div>
          <h2 className="text-sm font-medium text-zinc-900">Propietario</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Con estos datos iniciará sesión en /login.</p>
        </div>

        <Field label="Nombre" name="ownerName" error={state?.errors?.ownerName}>
          <input
            id="ownerName"
            name="ownerName"
            type="text"
            autoComplete="off"
            required
            placeholder="Ej. María López"
            defaultValue={fields.ownerName}
            className={inputClass}
          />
        </Field>

        <Field label="Correo" name="ownerEmail" error={state?.errors?.ownerEmail}>
          <input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            autoComplete="off"
            required
            placeholder="propietario@correo.com"
            defaultValue={fields.ownerEmail}
            className={inputClass}
          />
        </Field>

        <Field
          label="Contraseña inicial"
          name="ownerPassword"
          error={state?.errors?.ownerPassword}
          hint="Mínimo 8 caracteres. Compártela con el propietario de forma segura."
        >
          <input
            id="ownerPassword"
            name="ownerPassword"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            className={inputClass}
          />
        </Field>
      </div>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <Link href="/admin" className={secondaryButtonClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Creando…" : "Crear taller"}
        </button>
      </div>
    </form>
  );
}
