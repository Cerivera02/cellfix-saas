"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";

export function CategoryCreateForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <Field label="Nombre" name={`${id}-name`} error={state?.errors?.name}>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="off"
          required
          maxLength={60}
          placeholder="Pantallas, baterías…"
          defaultValue={state?.fields?.name}
          className={inputClass}
        />
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
        {pending ? "Creando…" : "Crear categoría"}
      </button>
    </form>
  );
}
