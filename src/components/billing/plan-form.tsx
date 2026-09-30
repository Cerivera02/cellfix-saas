"use client";

import { useActionState, useState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { ModuleChangeState } from "@/lib/billing/actions";
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
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

function useModuleSelection(defaultModules: ModuleKey[]) {
  const [selected, setSelected] = useState<ModuleKey[]>(defaultModules);
  // Al quitar un módulo se quitan también los que dependen de él (Compras sin Inventario).
  const toggle = (key: ModuleKey, checked: boolean) =>
    setSelected((current) =>
      checked
        ? MODULE_KEYS.filter((other) => other === key || current.includes(other))
        : current.filter((other) => other !== key && !MODULES[other].requires.includes(key)),
    );
  const unchanged = selected.length === defaultModules.length && selected.every((key) => defaultModules.includes(key));
  return { selected, setSelected, toggle, unchanged };
}

function ModuleChecklist({
  pricing,
  selected,
  toggle,
}: {
  pricing: PlanPricing;
  selected: ModuleKey[];
  toggle: (key: ModuleKey, checked: boolean) => void;
}) {
  const money = (cents: number) => formatCents(cents, pricing.currency);
  const priceOf = (key: ModuleKey) => pricing.modules.find((module) => module.key === key)?.priceCents ?? 0;

  return (
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
        // Solo se desactiva lo que no se puede elegir: una casilla desactivada no viaja en el formulario.
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
  );
}

function Message({ state }: { state: { message?: string; success?: string } | undefined }) {
  return (
    <p aria-live="polite" className={`min-h-5 text-sm ${state?.success ? "text-emerald-600" : "text-red-600"}`}>
      {state?.success ?? state?.message}
    </p>
  );
}

// Primera suscripción: elige módulos y paga en Stripe Checkout.
export function CheckoutPlanForm({
  pricing,
  defaultModules,
  firstChargeAt,
  disabled,
  action,
}: {
  pricing: PlanPricing;
  defaultModules: ModuleKey[];
  // Si aún quedan días de prueba: fecha (ISO) del primer cobro. Hoy no se cobra nada.
  firstChargeAt: string | null;
  disabled?: boolean;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const { selected, toggle } = useModuleSelection(defaultModules);
  const money = (cents: number) => formatCents(cents, pricing.currency);
  const total =
    pricing.baseCents +
    pricing.modules.filter((module) => selected.includes(module.key)).reduce((sum, module) => sum + module.priceCents, 0);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <ModuleChecklist pricing={pricing} selected={selected} toggle={toggle} />

      <div className="flex items-baseline justify-between border-t border-zinc-200 pt-4">
        <p className="text-sm text-zinc-600">Total al mes</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {money(total)} <span className="text-sm font-normal text-zinc-500">{pricing.currency.toUpperCase()}</span>
        </p>
      </div>

      <p className="text-sm text-zinc-600">
        {firstChargeAt
          ? `No se te cobrará hoy. Tu primer cobro será el ${dateFormatter.format(new Date(firstChargeAt))} por ${money(total)}.`
          : "Se cobra hoy y después automáticamente cada mes con la misma tarjeta."}
      </p>

      <Message state={state} />

      <button type="submit" disabled={pending || disabled} className={`self-end ${primaryButtonClass}`}>
        {pending ? "Abriendo Stripe…" : "Pagar con Stripe"}
      </button>
    </form>
  );
}

// Suscripción vigente: cambia módulos en dos pasos (revisar el ajuste y confirmar).
export function ChangePlanForm({
  pricing,
  defaultModules,
  disabled,
  previewAction,
  updateAction,
}: {
  pricing: PlanPricing;
  defaultModules: ModuleKey[];
  disabled?: boolean;
  previewAction: (state: ModuleChangeState, formData: FormData) => Promise<ModuleChangeState>;
  updateAction: (state: ModuleChangeState, formData: FormData) => Promise<ModuleChangeState>;
}) {
  const [previewState, previewFormAction, previewPending] = useActionState(previewAction, undefined);
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, undefined);
  const { selected, setSelected, toggle, unchanged } = useModuleSelection(defaultModules);
  const pending = previewPending || updatePending;
  const money = (cents: number) => formatCents(cents, preview?.currency ?? pricing.currency);

  // La vista previa solo vale para la selección con la que se calculó.
  const candidate = previewState?.preview;
  const preview =
    candidate &&
    !unchanged &&
    candidate.modules.length === selected.length &&
    candidate.modules.every((key) => selected.includes(key))
      ? candidate
      : null;

  // El mensaje más reciente: error de la vista previa o resultado del cambio.
  const message = preview ? updateState : updateState?.success && unchanged ? updateState : (previewState ?? updateState);

  return (
    <form className="flex flex-col gap-5" noValidate>
      {/* Si cambia la selección después de revisar, la vista previa deja de valer y se oculta. */}
      <ModuleChecklist pricing={pricing} selected={selected} toggle={toggle} />

      {preview && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <input type="hidden" name="prorationDate" value={preview.prorationDate} />
          <p>
            Nuevo total mensual: <span className="font-medium text-zinc-900 tabular-nums">{money(preview.monthlyTotalCents)}</span>
          </p>
          {preview.prorationCents > 0 && (
            <p>
              Hoy no se cobra nada. Por los días que faltan del periodo se agregarán{" "}
              <span className="font-medium tabular-nums">{money(preview.prorationCents)}</span> a tu próxima factura.
            </p>
          )}
          {preview.prorationCents < 0 && (
            <p>
              Por los días que faltan del periodo se abonarán{" "}
              <span className="font-medium tabular-nums">{money(-preview.prorationCents)}</span> a tu próxima factura.
            </p>
          )}
          {preview.nextChargeAt && (
            <p>
              Próximo cobro: {dateFormatter.format(new Date(preview.nextChargeAt))} por{" "}
              <span className="font-medium tabular-nums">{money(preview.nextInvoiceCents)}</span>.
            </p>
          )}
        </div>
      )}

      <Message state={message} />

      <div className="flex justify-end gap-2">
        {preview ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSelected(defaultModules)}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>
            <button type="submit" formAction={updateFormAction} disabled={pending || disabled} className={primaryButtonClass}>
              {updatePending ? "Guardando…" : "Confirmar cambio"}
            </button>
          </>
        ) : (
          <button
            type="submit"
            formAction={previewFormAction}
            disabled={pending || disabled || unchanged}
            className={primaryButtonClass}
          >
            {previewPending ? "Calculando…" : "Revisar cambio"}
          </button>
        )}
      </div>
    </form>
  );
}
