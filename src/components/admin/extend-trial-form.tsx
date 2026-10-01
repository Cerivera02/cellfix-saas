"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, primaryButtonClass } from "@/components/ui/form";
import { IntegerInput } from "@/components/ui/money-input";
import type { FormState } from "@/lib/form-state";

export function ExtendTrialForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <div className="flex items-end gap-3">
        <div className="w-32">
          <Field label="Días" name="days" error={state?.errors?.days}>
            <IntegerInput id="days" name="days" placeholder="7" defaultValue={state?.fields?.days ?? "7"} />
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
