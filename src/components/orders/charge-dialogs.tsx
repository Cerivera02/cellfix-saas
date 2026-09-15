"use client";

import { useId, useState, useTransition } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { PaymentForm, type AccountOption } from "@/components/cash/payment-dialog";
import { DialogButton, useDialogAction } from "@/components/ui/dialog-button";
import {
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents } from "@/lib/cash/money";
import type { ChargeRequest } from "@/lib/cash/payment-request";
import type { FormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/inventory/format";
import type { ChargeResult } from "@/lib/orders/actions";

// Cobros de una orden: anticipo, entrega (saldo o reembolso) y cancelación.

const METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }));

export function OrderPaymentDialog({
  action,
  accounts,
  suggestedCents,
  label,
}: {
  action: (charge: ChargeRequest) => Promise<ChargeResult>;
  accounts: AccountOption[];
  suggestedCents: number;
  label: string;
}) {
  return (
    <DialogButton
      label={label}
      className={secondaryButtonClass}
      title={label}
      description="Entra al turno de caja abierto."
      size="lg"
    >
      {(close) => (
        <PaymentForm
          totalCents={suggestedCents}
          exact={false}
          accounts={accounts}
          confirmLabel="Registrar cobro"
          onCancel={close}
          onConfirm={async (charge) => {
            const result = await action(charge);
            if (result.success) close();
            return result.message;
          }}
        />
      )}
    </DialogButton>
  );
}

type DeliverAction = (request: ChargeRequest & { refundMethod: string | null }) => Promise<ChargeResult>;

function Totals({ totalCents, paidCents }: { totalCents: number; paidCents: number }) {
  const balance = totalCents - paidCents;
  return (
    <dl className="rounded-xl bg-zinc-50 px-4 py-3 text-sm">
      <div className="flex justify-between">
        <dt className="text-zinc-600">Total de la reparación</dt>
        <dd className="tabular-nums">{formatMoney(fromCents(totalCents))}</dd>
      </div>
      <div className="mt-1 flex justify-between">
        <dt className="text-zinc-600">Pagado</dt>
        <dd className="tabular-nums">{formatMoney(fromCents(paidCents))}</dd>
      </div>
      <div className="mt-1 flex justify-between font-medium">
        <dt>{balance < 0 ? "A reembolsar" : "Saldo"}</dt>
        <dd className="tabular-nums">{formatMoney(fromCents(Math.abs(balance)))}</dd>
      </div>
    </dl>
  );
}

function DeliverContent({
  action,
  accounts,
  totalCents,
  paidCents,
  canCollect,
  onDone,
}: {
  action: DeliverAction;
  accounts: AccountOption[];
  totalCents: number;
  paidCents: number;
  canCollect: boolean;
  onDone: () => void;
}) {
  const balance = totalCents - paidCents;
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  // Si la entrega se registra, la acción redirige; aquí solo llegan errores.
  const confirm = (request: Parameters<DeliverAction>[0]) =>
    startTransition(async () => {
      setError((await action(request))?.message ?? null);
    });

  if (balance > 0 && canCollect) {
    return (
      <div className="flex flex-col gap-4">
        <Totals totalCents={totalCents} paidCents={paidCents} />
        <PaymentForm
          totalCents={balance}
          accounts={accounts}
          confirmLabel="Cobrar y entregar"
          onCancel={onDone}
          onConfirm={async (charge) => (await action({ ...charge, refundMethod: null }))?.message}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Totals totalCents={totalCents} paidCents={paidCents} />

      {balance > 0 && (
        <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          Hay saldo pendiente. Pide a quien cobra reparaciones que registre el pago para entregar el equipo.
        </p>
      )}

      {balance < 0 &&
        (canCollect ? (
          <Field label="Reembolsar en" name={`${id}-refund`} hint="Lo pagado supera el total de la reparación.">
            <Select id={`${id}-refund`} options={METHOD_OPTIONS} defaultValue={refundMethod} onChange={(value) => setRefundMethod(value ?? "cash")} />
          </Field>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            Hay que reembolsar la diferencia. Pide a quien cobra reparaciones que entregue el equipo.
          </p>
        ))}

      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {error}
      </p>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending || balance > 0 || (balance < 0 && !canCollect)}
          onClick={() => confirm({ payments: [], cashReceived: null, refundMethod: balance < 0 ? refundMethod : null })}
          className={primaryButtonClass}
        >
          {pending ? "Registrando…" : balance < 0 ? "Reembolsar y entregar" : "Confirmar entrega"}
        </button>
      </div>
    </div>
  );
}

export function DeliverDialog(props: {
  action: DeliverAction;
  accounts: AccountOption[];
  totalCents: number;
  paidCents: number;
  canCollect: boolean;
}) {
  return (
    <DialogButton label="Entregar equipo" className={primaryButtonClass} title="Entregar equipo" size="lg">
      {(close) => <DeliverContent {...props} onDone={close} />}
    </DialogButton>
  );
}

function CancelForm({
  action,
  paidTotal,
  onDone,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  paidTotal: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const id = useId();
  const paid = Number(paidTotal) > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Motivo" name={`${id}-reason`} error={state?.errors?.reason}>
        <input
          id={`${id}-reason`}
          name="reason"
          type="text"
          autoComplete="off"
          maxLength={300}
          placeholder="El cliente ya no quiso la reparación…"
          defaultValue={state?.fields?.reason}
          className={inputClass}
        />
      </Field>

      {paid && (
        <Field label={`Reembolsar ${formatMoney(paidTotal)} en`} name={`${id}-refund`}>
          <Select id={`${id}-refund`} name="refundMethod" options={METHOD_OPTIONS} defaultValue={state?.fields?.refundMethod || "cash"} />
        </Field>
      )}

      <p className="text-xs text-zinc-500">Las refacciones de la orden regresan al inventario. No se puede deshacer.</p>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Volver
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {pending ? "Cancelando…" : "Cancelar orden"}
        </button>
      </div>
    </form>
  );
}

export function CancelOrderDialog({
  action,
  paidTotal,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  paidTotal: string;
}) {
  return (
    <DialogButton
      label="Cancelar orden"
      className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
      title="Cancelar orden"
    >
      {(close) => <CancelForm action={action} paidTotal={paidTotal} onDone={close} />}
    </DialogButton>
  );
}
