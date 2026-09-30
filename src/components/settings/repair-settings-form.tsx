"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, primaryButtonClass } from "@/components/ui/form";
import { MoneyInput } from "@/components/ui/money-input";
import type { FormState } from "@/lib/form-state";

export function RepairSettingsForm({
  action,
  defaults,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: { diagnosisFee: string; diagnosisCredit: boolean };
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // Tras guardar o con errores se muestra lo último enviado.
  const diagnosisFee = state?.fields?.diagnosisFee ?? defaults.diagnosisFee;
  const diagnosisCredit = state?.fields ? state.fields.diagnosisCredit === "on" : defaults.diagnosisCredit;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6" noValidate>
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Diagnóstico</h2>
        <Field
          label="Costo de diagnóstico sugerido"
          name="repair-diagnosisFee"
          error={state?.errors?.diagnosisFee}
          hint="Se propone al recibir un equipo a diagnóstico; se puede cambiar en cada orden. 0 si es gratis."
        >
          <MoneyInput
            // Se vuelve a montar al guardar para mostrar el importe normalizado.
            key={diagnosisFee}
            id="repair-diagnosisFee"
            name="diagnosisFee"
            maxLength={20}
            defaultValue={diagnosisFee}
            wrapperClassName="max-w-48"
          />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-zinc-700">
          <input
            key={String(diagnosisCredit)}
            type="checkbox"
            name="diagnosisCredit"
            defaultChecked={diagnosisCredit}
            className="mt-0.5 size-4 accent-zinc-900"
          />
          <span>
            Descontar el diagnóstico del total si se hace la reparación
            <span className="block text-xs text-zinc-500">
              Si se hace la reparación, lo pagado de diagnóstico cuenta como anticipo (nunca se cobra menos que el
              diagnóstico); si se entrega sin reparación, el diagnóstico se cobra completo.
            </span>
          </span>
        </label>
      </section>

      <div className="flex flex-col gap-2">
        <FormMessage state={state} />
        <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
