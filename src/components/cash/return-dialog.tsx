"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, ghostButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { IntegerInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents, refundForLine } from "@/lib/cash/money";
import type { FormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/inventory/format";

export type ReturnLine = {
  id: string;
  itemName: string;
  quantity: number;
  returnedQuantity: number;
  totalCents: number;
  refundedCents: number;
};

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function ReturnForm({ action, lines, onDone }: { action: Action; lines: ReturnLine[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onDone();
    return result;
  }, undefined);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, 0])),
  );
  const id = useId();

  // Mismo cálculo que el servidor: el reembolso mostrado es el que se registrará.
  const refundCents = lines.reduce((sum, line) => {
    const quantity = quantities[line.id] ?? 0;
    if (quantity <= 0) return sum;
    return (
      sum +
      refundForLine(
        {
          totalCents: line.totalCents,
          quantity: line.quantity,
          returnedQuantity: line.returnedQuantity,
          refundedCents: line.refundedCents,
        },
        quantity,
      )
    );
  }, 0);
  const restockDefault = state?.selections?.restock ? state.selections.restock.length > 0 : true;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-700">Piezas a devolver</p>
          <button
            type="button"
            onClick={() =>
              setQuantities(Object.fromEntries(lines.map((line) => [line.id, line.quantity - line.returnedQuantity])))
            }
            className={ghostButtonClass}
          >
            Devolver todo
          </button>
        </div>

        <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {lines.map((line) => {
            const remaining = line.quantity - line.returnedQuantity;
            return (
              <li key={line.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-900">{line.itemName}</p>
                  <p className="text-xs text-zinc-500">
                    Vendidas {line.quantity}
                    {line.returnedQuantity > 0 && ` · ya devueltas ${line.returnedQuantity}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <IntegerInput
                    bare
                    name={`qty-${line.id}`}
                    max={remaining}
                    aria-label={`Piezas de ${line.itemName} a devolver`}
                    value={String(quantities[line.id] ?? 0)}
                    onChange={(value) =>
                      setQuantities((current) => ({
                        ...current,
                        [line.id]: Math.max(0, Math.min(remaining, Math.floor(Number(value)) || 0)),
                      }))
                    }
                    className="h-9 w-16 rounded-lg border border-zinc-200 text-center text-sm"
                  />
                  <span className="text-xs whitespace-nowrap text-zinc-500">de {remaining}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {state?.errors?.lines && <p className="mt-1.5 text-xs text-red-600">{state.errors.lines}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reembolsar en" name={`${id}-method`} error={state?.errors?.refundMethod}>
          <Select
            id={`${id}-method`}
            name="refundMethod"
            options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
            defaultValue={state?.fields?.refundMethod || "cash"}
          />
        </Field>
        <div className="flex flex-col justify-end">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Reembolso</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(fromCents(refundCents))}</p>
        </div>
      </div>

      <Field label="Motivo" name={`${id}-reason`} error={state?.errors?.reason}>
        <input
          id={`${id}-reason`}
          name="reason"
          type="text"
          autoComplete="off"
          maxLength={300}
          defaultValue={state?.fields?.reason}
          className={inputClass}
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700">
        <input type="checkbox" name="restock" defaultChecked={restockDefault} className="mt-0.5 size-4 accent-zinc-900" />
        <span>
          Regresar las piezas al inventario
          <span className="block text-xs text-zinc-500">Desmárcalo si el artículo regresó dañado.</span>
        </span>
      </label>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Registrando…" : "Registrar devolución"}
        </button>
      </div>
    </form>
  );
}

export function ReturnDialog({ action, lines }: { action: Action; lines: ReturnLine[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Registrar devolución
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar devolución"
        description="Elige qué piezas regresan; se reembolsa la parte proporcional."
        size="lg"
      >
        {open && <ReturnForm action={action} lines={lines} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
