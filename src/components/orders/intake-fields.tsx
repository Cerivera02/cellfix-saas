"use client";

import { useId, useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { PaymentRowsFields, usePaymentRows, type AccountOption } from "@/components/cash/payment-dialog";
import { IntakeFreePart, IntakePartsToGet, IntakeStockParts } from "@/components/orders/intake-parts";
import { Field } from "@/components/ui/form";
import { parseMoneyCents } from "@/lib/cash/form";
import type { FormState } from "@/lib/form-state";
import {
  INTAKE_TYPES,
  INTAKE_TYPE_HINTS,
  INTAKE_TYPE_LABELS,
  isIntakeType,
  type IntakeType,
} from "@/lib/orders/labels";

// Configuración y permisos para el cobro al recibir el equipo.
export type IntakeOptions = {
  // Costo del diagnóstico sugerido en Configuración → Órdenes.
  diagnosisFee: string;
  // Si el diagnóstico se descuenta del total al hacerse la reparación.
  diagnosisCredit: boolean;
  // Sin permiso para cobrar no se muestra el cobro: la orden se registra sin anticipo.
  canCollect: boolean;
  usesCashShift: boolean;
  accounts: AccountOption[];
  // Sin permiso para ver precios no se muestran ni capturan importes de la refacción.
  canSeePrices: boolean;
  // Con el módulo de Inventario la refacción en existencia se elige del inventario; sin él, se describe.
  hasInventory: boolean;
};

// Tipo de ingreso, refacciones y anticipo (o pago del diagnóstico) dentro del formulario de
// recepción. El cobro viaja como JSON en el campo oculto `intakePayment`; vacío si no se cobra.
export function IntakeFields({ options, state }: { options: IntakeOptions; state: FormState }) {
  const defaults = { intakeType: state?.fields?.intakeType, diagnosisFee: state?.fields?.diagnosisFee };
  const errors = state?.errors;
  const id = useId();
  const [type, setType] = useState<IntakeType | null>(
    defaults.intakeType && isIntakeType(defaults.intakeType) ? defaults.intakeType : null,
  );
  const [fee, setFee] = useState(defaults.diagnosisFee ?? options.diagnosisFee);
  const feeCents = parseMoneyCents(fee) ?? 0;
  const payment = usePaymentRows({
    totalCents: type === "diagnosis" ? feeCents : 0,
    exact: type === "diagnosis",
  });

  const collects = options.canCollect && type !== null && (type !== "diagnosis" || feeCents > 0);
  // Sin importes capturados no se envía cobro (en "por conseguir" el anticipo es opcional).
  const hasAmounts = payment.rows.some((row) => row.amount.trim() !== "");
  const charge = collects && hasAmounts ? JSON.stringify(payment.toCharge()) : "";

  const chooseType = (next: IntakeType) => {
    setType(next);
    payment.reset(next === "diagnosis" ? feeCents : 0);
  };

  const moneyTitle =
    type === "in_stock" ? "Anticipo" : type === "order_part" ? "Anticipo sugerido (opcional)" : "Cobro del diagnóstico";

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="text-sm font-medium text-zinc-700">Tipo de ingreso</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {INTAKE_TYPES.map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm transition ${
                type === option ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="intakeType"
                value={option}
                checked={type === option}
                onChange={() => chooseType(option)}
                className="mt-0.5 size-4 accent-zinc-900"
              />
              <span>
                <span className="block font-medium text-zinc-900">{INTAKE_TYPE_LABELS[option]}</span>
                <span className="block text-xs text-zinc-500">{INTAKE_TYPE_HINTS[option]}</span>
              </span>
            </label>
          ))}
        </div>
        {errors?.intakeType && <p className="mt-1.5 text-xs text-red-600">{errors.intakeType}</p>}
      </fieldset>

      {type === "in_stock" &&
        (options.hasInventory ? (
          <IntakeStockParts id={`${id}-parts`} error={errors?.intakeParts} />
        ) : (
          <IntakeFreePart id={`${id}-parts`} state={state} showPrices={options.canSeePrices} />
        ))}

      {type === "order_part" && <IntakePartsToGet id={`${id}-to-get`} state={state} hasInventory={options.hasInventory} />}

      {type === "diagnosis" && (
        <div className="max-w-xs">
          <Field
            label="Costo del diagnóstico"
            name={`${id}-fee`}
            error={errors?.diagnosisFee}
            hint={
              feeCents === 0
                ? "Diagnóstico gratis."
                : options.diagnosisCredit
                  ? "Si se hace la reparación, se descuenta del total."
                  : "Se cobra aparte de la reparación."
            }
          >
            <MoneyInput
              id={`${id}-fee`}
              name="diagnosisFee"
              value={fee}
              onChange={(value) => {
                setFee(value);
                payment.setTotal(parseMoneyCents(value) ?? 0);
              }}
            />
          </Field>
        </div>
      )}

      {type !== null && (type !== "diagnosis" || feeCents > 0) && !options.canCollect && (
        <p className="rounded-lg bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-700">
          {type === "diagnosis" ? "El diagnóstico" : "El anticipo"} lo cobra quien tenga permiso para cobrar; la orden se
          registra sin cobro.
        </p>
      )}

      {collects && (
        <section className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-900">{moneyTitle}</h3>
            {options.usesCashShift && <p className="text-xs text-zinc-500">Entra al turno de caja abierto.</p>}
          </div>
          <PaymentRowsFields state={payment} accounts={options.accounts} canAddRows />
          {hasAmounts && payment.blocker && <p className="text-sm text-amber-700">{payment.blocker}</p>}
        </section>
      )}

      <input type="hidden" name="intakePayment" value={charge} />
    </div>
  );
}
