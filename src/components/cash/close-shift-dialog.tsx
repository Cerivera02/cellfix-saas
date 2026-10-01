"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { MoneyInput } from "@/components/ui/money-input";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { parseMoneyCents } from "@/lib/cash/form";
import { fromCents, toCents } from "@/lib/cash/money";
import type { FormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/inventory/format";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function CloseShiftForm({ action, expectedCash, onCancel }: { action: Action; expectedCash: string; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [counted, setCounted] = useState("");
  const id = useId();

  const countedCents = parseMoneyCents(counted);
  const difference = countedCents === null ? null : countedCents - toCents(expectedCash);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="rounded-xl bg-zinc-50 px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Efectivo esperado en caja</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(expectedCash)}</p>
      </div>

      <Field label="Efectivo contado" name={`${id}-counted`} error={state?.errors?.countedAmount}>
        <MoneyInput id={`${id}-counted`} name="countedAmount" value={counted} onChange={setCounted} autoFocus />
      </Field>

      {difference !== null && (
        <p
          className={`rounded-lg px-3.5 py-2.5 text-sm ${
            difference === 0
              ? "bg-emerald-50 text-emerald-800"
              : difference > 0
                ? "bg-amber-50 text-amber-800"
                : "bg-red-50 text-red-800"
          }`}
        >
          {difference === 0
            ? "La caja cuadra."
            : difference > 0
              ? `Sobrante de ${formatMoney(fromCents(difference))}.`
              : `Faltante de ${formatMoney(fromCents(-difference))}.`}
        </p>
      )}

      <Field label="Notas" name={`${id}-notes`} hint="Opcional: explica un sobrante o faltante.">
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Faltaron $20 por un cambio mal dado"
          defaultValue={state?.fields?.notes}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Cerrando…" : "Cerrar caja"}
        </button>
      </div>
    </form>
  );
}

export function CloseShiftDialog({ action, expectedCash }: { action: Action; expectedCash: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}>
        Cerrar caja
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cerrar caja"
        description="Cuenta el efectivo y regístralo; se guardará el corte con la diferencia."
      >
        {open && <CloseShiftForm action={action} expectedCash={expectedCash} onCancel={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
