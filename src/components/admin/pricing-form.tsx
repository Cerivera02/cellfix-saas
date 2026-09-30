"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass } from "@/components/ui/form";
import { MoneyInput } from "@/components/ui/money-input";
import type { FormState } from "@/lib/form-state";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";

export type PricingDefaults = {
  trialDays: string;
  graceDays: string;
  basePrice: string;
  modulePrices: Record<ModuleKey, string>;
};

export function PricingForm({
  defaults,
  currency,
  action,
}: {
  defaults: PricingDefaults;
  currency: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const value = (key: string, fallback: string) => state?.fields?.[key] ?? fallback;
  const errors = state?.errors;

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium text-zinc-900">Prueba gratuita</legend>
        <Field label="Días de prueba" name="trialDays" error={errors?.trialDays} hint="Con todos los módulos activos.">
          <input
            id="trialDays"
            name="trialDays"
            type="text"
            inputMode="numeric"
            defaultValue={value("trialDays", defaults.trialDays)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Días de gracia"
          name="graceDays"
          error={errors?.graceDays}
          hint="Uso normal con aviso; después se bloquea."
        >
          <input
            id="graceDays"
            name="graceDays"
            type="text"
            inputMode="numeric"
            defaultValue={value("graceDays", defaults.graceDays)}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium text-zinc-900">
          Precios mensuales ({currency.toUpperCase()})
        </legend>
        <Field label="Plan base" name="basePrice" error={errors?.basePrice} hint="Reparaciones, clientes y equipo.">
          <MoneyInput id="basePrice" name="basePrice" defaultValue={value("basePrice", defaults.basePrice)} />
        </Field>
        {MODULE_KEYS.map((key) => (
          <Field key={key} label={MODULES[key].label} name={`price_${key}`} error={errors?.[`price_${key}`]}>
            <MoneyInput
              id={`price_${key}`}
              name={`price_${key}`}
              defaultValue={value(`price_${key}`, defaults.modulePrices[key])}
            />
          </Field>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
          {pending ? "Guardando…" : "Guardar precios"}
        </button>
      </div>
    </form>
  );
}
