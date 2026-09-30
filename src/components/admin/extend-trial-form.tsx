"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";

export function ExtendTrialForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <div className="flex items-end gap-3">
        <div className="w-32">
          <Field label="Días" name="days" error={state?.errors?.days}>
            <input
              id="days"
              name="days"
              type="text"
              inputMode="numeric"
              defaultValue={state?.fields?.days ?? "7"}
              className={inputClass}
            />
          </Field>
        </div>
        <button type="submit" disabled={pending} className={`mb-px py-2.5 ${primaryButtonClass}`}>
          {pending ? "Extendiendo…" : "Extender prueba"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
