"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { ModuleKey } from "@/lib/modules";
import type { PublicPricing } from "@/lib/billing/pricing";

// Lo que trae la base sin importar los módulos que se elijan.
const BASE_INCLUDES = ["Órdenes de reparación", "Clientes", "Equipo y roles"];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function PricingCalculator({ pricing }: { pricing: PublicPricing }) {
  const [selected, setSelected] = useState<ModuleKey[]>([]);
  const baseId = useId();
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: pricing.currency.toUpperCase() });
  const format = (cents: number) => money.format(cents / 100);

  // Al marcar un módulo se agregan sus requisitos; al desmarcarlo se quitan los que dependen de él.
  const toggle = (key: ModuleKey, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
        pricing.modules.find((m) => m.key === key)?.requires.forEach((required) => next.add(required));
      } else {
        next.delete(key);
        pricing.modules.filter((m) => m.requires.includes(key)).forEach((m) => next.delete(m.key));
      }
      return pricing.modules.map((m) => m.key).filter((k) => next.has(k));
    });
  };

  const chosen = pricing.modules.filter((m) => selected.includes(m.key));
  const totalCents = pricing.baseCents + chosen.reduce((sum, m) => sum + m.priceCents, 0);
  const labelOf = (key: ModuleKey) => pricing.modules.find((m) => m.key === key)?.label ?? key;

  return (
    <div className="mt-14 grid items-start gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
      <div>
        {/* Base: siempre incluida, sin casilla porque no se puede quitar. */}
        <div className="border-b border-white/15 pb-8">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-display text-lg font-bold tracking-wide uppercase [font-stretch:75%]">Base</h3>
            <p className="font-folio text-white">
              {format(pricing.baseCents)}
              <span className="text-sm text-zinc-400"> /mes</span>
            </p>
          </div>
          <p className="mt-1 text-sm text-zinc-400">Siempre incluida.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {BASE_INCLUDES.map((item) => (
              <li
                key={item}
                className="rounded-sm border border-white/70 bg-white px-2.5 py-1 font-display text-sm font-bold tracking-[0.14em] text-zinc-800 uppercase [font-stretch:75%]"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <fieldset className="mt-8">
          <legend className="font-display text-lg font-bold tracking-wide uppercase [font-stretch:75%]">
            Módulos
          </legend>
          <p className="mt-1 text-sm text-zinc-400">Agrega solo los que usa tu taller.</p>

          <ul className="mt-5 space-y-2">
            {pricing.modules.map((module) => {
              const inputId = `${baseId}-${module.key}`;
              const checked = selected.includes(module.key);
              return (
                <li key={module.key}>
                  <label
                    htmlFor={inputId}
                    className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-1 rounded-md border px-4 py-3.5 transition has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-white ${
                      checked ? "border-white/60 bg-white/10" : "border-white/15 hover:border-white/40"
                    }`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggle(module.key, event.target.checked)}
                      aria-describedby={`${inputId}-desc`}
                      className="mt-0.5 size-4 cursor-pointer accent-white focus-visible:outline-none"
                    />
                    <span className="font-display font-bold tracking-[0.1em] uppercase [font-stretch:75%]">
                      {module.label}
                    </span>
                    <span className="text-right font-folio text-sm whitespace-nowrap">
                      +{format(module.priceCents)}
                    </span>
                    <span id={`${inputId}-desc`} className="col-start-2 col-end-4 text-sm leading-relaxed text-zinc-400">
                      {module.description}
                      {module.requires.length > 0 && (
                        <span className="sr-only"> Al marcarlo se agrega {module.requires.map(labelOf).join(" y ")}.</span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>

      {/* La cotización se imprime como ticket térmico: cada módulo marcado agrega un renglón. */}
      <div className="lg:sticky lg:top-24">
        <div className="receipt mx-auto max-w-sm bg-white px-6 pt-7 pb-10 text-zinc-900 shadow-[0_24px_48px_-16px_rgb(0_0_0/0.45)] [--perf-bg:var(--color-zinc-950)] sm:px-7">
          <div className="text-center">
            <p className="font-display text-xl font-extrabold tracking-tight [font-stretch:112%]">CellFix</p>
            <p className="mt-1 font-folio text-xs tracking-wide text-zinc-500 uppercase">Cotización mensual</p>
          </div>

          <ul className="mt-6 space-y-2 border-t border-dashed border-zinc-300 pt-4 font-folio text-sm">
            <li className="flex items-baseline gap-2">
              <span>Base</span>
              <span aria-hidden="true" className="flex-1 border-b border-dotted border-zinc-300" />
              <span>{format(pricing.baseCents)}</span>
            </li>
            {chosen.map((module) => (
              <li key={module.key} className="log-in flex items-baseline gap-2">
                <span className="min-w-0 truncate">{module.label}</span>
                <span aria-hidden="true" className="min-w-4 flex-1 border-b border-dotted border-zinc-300" />
                <span>{format(module.priceCents)}</span>
              </li>
            ))}
          </ul>

          <div className="perforation -mx-6 mt-5 sm:-mx-7" />

          <div className="flex items-baseline justify-between gap-4 pt-2">
            <p className="font-folio text-xs tracking-wide text-zinc-500 uppercase">Total al mes</p>
            <p aria-live="polite" className="font-folio text-3xl font-medium tracking-tight">
              {format(totalCents)}
            </p>
          </div>
          <p className="mt-1 text-right font-folio text-xs text-zinc-500">
            Precio mensual en {pricing.currency.toUpperCase()}
          </p>

          <div className="mt-7 border-t border-dashed border-zinc-300 pt-6">
            <Link
              href="/registro"
              className={`block rounded-lg bg-zinc-900 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-zinc-700 ${focusRing}`}
            >
              Empieza tu prueba gratis
            </Link>
            <p className="mt-3 text-center text-xs leading-relaxed text-zinc-500">
              {pricing.trialDays} días con todos los módulos. Sin tarjeta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
