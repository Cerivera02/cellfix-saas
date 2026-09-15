"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass } from "@/components/ui/form";

export function TenantNameForm({
  defaultName,
  action,
}: {
  defaultName: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <Field label="Nombre" name="tenant-name" error={state?.errors?.name}>
        <input
          id="tenant-name"
          name="name"
          type="text"
          autoComplete="off"
          required
          defaultValue={state?.fields?.name ?? defaultName}
          className={inputClass}
        />
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
