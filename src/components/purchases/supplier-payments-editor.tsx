"use client";

import { useId } from "react";
import type { AccountOption } from "@/components/cash/payment-dialog";
import { MoneyTextInput } from "@/components/cash/money-text-input";
import { Field, dangerGhostButtonClass, inputClass, secondaryButtonClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { describeAccount } from "@/lib/cash/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/cash/labels";
import { fromCents } from "@/lib/cash/money";
import type { SupplierPaymentRequest } from "@/lib/purchases/actions";

export type SupplierPaymentRow = SupplierPaymentRequest & { key: number; method: PaymentMethod };

export function newPaymentRow(rows: SupplierPaymentRow[], amountCents: number, drawerAvailable: boolean): SupplierPaymentRow {
  return {
    key: Math.max(0, ...rows.map((row) => row.key)) + 1,
    method: "cash",
    amount: amountCents > 0 ? fromCents(amountCents) : "",
    bankAccountId: null,
    reference: "",
    fromDrawer: drawerAvailable,
  };
}

// Pagos al proveedor: efectivo (de la caja abierta o por fuera), tarjeta o transferencia.
export function SupplierPaymentsEditor({
  rows,
  onChange,
  accounts,
  drawerAvailable,
  nextAmountCents,
  addLabel,
}: {
  rows: SupplierPaymentRow[];
  onChange: (rows: SupplierPaymentRow[]) => void;
  accounts: AccountOption[];
  drawerAvailable: boolean;
  nextAmountCents: number;
  addLabel: string;
}) {
  const id = useId();
  const update = (key: number, patch: Partial<SupplierPaymentRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-zinc-200 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label="Método" name={`${id}-method-${row.key}`}>
              <Select
                id={`${id}-method-${row.key}`}
                options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
                defaultValue={row.method}
                onChange={(value) =>
                  value &&
                  update(row.key, {
                    method: value as PaymentMethod,
                    bankAccountId: null,
                    fromDrawer: value === "cash" && drawerAvailable,
                  })
                }
              />
            </Field>
            <Field label="Importe" name={`${id}-amount-${row.key}`}>
              <MoneyTextInput
                id={`${id}-amount-${row.key}`}
                value={row.amount}
                onChange={(value) => update(row.key, { amount: value })}
              />
            </Field>
          </div>

          {row.method === "cash" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={row.fromDrawer}
                disabled={!drawerAvailable}
                onChange={(event) => update(row.key, { fromDrawer: event.target.checked })}
                className="mt-0.5 size-4 accent-zinc-900"
              />
              <span>
                Tomar el efectivo de la caja abierta
                <span className="block text-xs text-zinc-500">
                  {drawerAvailable
                    ? "Se registra como salida en el corte de caja."
                    : "No hay caja abierta o no tienes permiso para operarla; se registra como pagado por fuera."}
                </span>
              </span>
            </label>
          )}

          {row.method === "transfer" && accounts.length > 0 && (
            <div className="mt-3">
              <Field label="Cuenta de origen" name={`${id}-account-${row.key}`} hint="Opcional.">
                <Select
                  id={`${id}-account-${row.key}`}
                  options={accounts.map((account) => ({ value: account.id, label: describeAccount(account) }))}
                  placeholder="Elige la cuenta"
                  isClearable
                  onChange={(value) => update(row.key, { bankAccountId: value })}
                />
              </Field>
            </div>
          )}

          {row.method !== "cash" && (
            <div className="mt-3">
              <Field label="Referencia" name={`${id}-reference-${row.key}`} hint="Opcional: folio, autorización o clave de rastreo.">
                <input
                  id={`${id}-reference-${row.key}`}
                  type="text"
                  autoComplete="off"
                  maxLength={60}
                  value={row.reference}
                  onChange={(event) => update(row.key, { reference: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <button
            type="button"
            onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
            className={`mt-3 ${dangerGhostButtonClass}`}
          >
            Quitar este pago
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, newPaymentRow(rows, nextAmountCents, drawerAvailable)])}
        className={`self-start ${secondaryButtonClass}`}
      >
        {addLabel}
      </button>
    </div>
  );
}
