"use client";

import { useActionState, useState } from "react";
import { primaryButtonClass } from "@/components/ui/form";
import { formatCents } from "@/lib/billing/format";
import type { FormState } from "@/lib/form-state";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";

// Precios que llegan del servidor (misma forma que PublicPricing, sin importar código de servidor).
type PlanPricing = {
  currency: string;
  baseCents: number;
  modules: { key: ModuleKey; priceCents: number }[];
};

const BASE_FEATURES = "Reparaciones, clientes y equipo";

const rowClass = "flex items-start gap-3 px-4 py-3";

export function PlanForm({
  pricing,
  defaultModules,
  mode,
  disabled,
  action,
}: {
  pricing: PlanPricing;
  defaultModules: ModuleKey[];
  // "checkout": suscribirse por primera vez. "update": cambiar módulos de la suscripción vigente.
  mode: "checkout" | "update";
  disabled?: boolean;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<ModuleKey[]>(defaultModules);

  const priceOf = (key: ModuleKey) => pricing.modules.find((module) => module.key === key)?.priceCents ?? 0;
  const money = (cents: number) => formatCents(cents, pricing.currency);
  const total = pricing.baseCents + selected.reduce((sum, key) => sum + priceOf(key), 0);
  const unchanged =
    mode === "update" && selected.length === defaultModules.length && selected.every((key) => defaultModules.includes(key));

  // Al quitar un módulo se quitan también los que dependen de él (Compras sin Inventario).
  const toggle = (key: ModuleKey, checked: boolean) =>
    setSelected((current) =>
      checked
        ? MODULE_KEYS.filter((other) => other === key || current.includes(other))
        : current.filter((other) => other !== key && !MODULES[other].requires.includes(key)),
    );

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        <li className={rowClass}>
          <input
            type="checkbox"
            checked
            readOnly
            disabled
            aria-label={BASE_FEATURES}
            className="mt-0.5 size-4 shrink-0 accent-zinc-900"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-900">Plan base</p>
            <p className="text-xs text-zinc-500">{BASE_FEATURES}. Siempre incluido.</p>
          </div>
          <p className="text-sm text-zinc-700 tabular-nums">{money(pricing.baseCents)}</p>
        </li>

        {MODULE_KEYS.map((key) => {
          const info = MODULES[key];
          const blocked = info.requires.some((required) => !selected.includes(required));
          return (
            <li key={key}>
              <label className={`${rowClass} ${blocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-zinc-50"}`}>
                <input
                  type="checkbox"
                  name="modules"
                  value={key}
                  checked={selected.includes(key) && !blocked}
                  disabled={blocked}
                  onChange={(event) => toggle(key, event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-zinc-900"
                />
                <span className="flex-1">
                  <span className={`block text-sm font-medium ${blocked ? "text-zinc-400" : "text-zinc-900"}`}>
                    {info.label}
                  </span>
                  <span className="block text-xs text-zinc-500">{info.description}</span>
                </span>
                <span className={`text-sm tabular-nums ${blocked ? "text-zinc-400" : "text-zinc-700"}`}>
                  +{money(priceOf(key))}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-baseline justify-between border-t border-zinc-200 pt-4">
        <p className="text-sm text-zinc-600">Total al mes</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {money(total)} <span className="text-sm font-normal text-zinc-500">{pricing.currency.toUpperCase()}</span>
        </p>
      </div>

      <p aria-live="polite" className={`min-h-5 text-sm ${state?.success ? "text-emerald-600" : "text-red-600"}`}>
        {state?.success ?? state?.message}
      </p>

      <button
        type="submit"
        disabled={pending || disabled || unchanged}
        className={`self-end ${primaryButtonClass}`}
      >
        {mode === "checkout"
          ? pending
            ? "Abriendo Stripe…"
            : "Pagar con Stripe"
          : pending
            ? "Guardando…"
            : "Guardar cambios"}
      </button>
    </form>
  );
}
