"use client";

import Link from "next/link";
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
  usesCashShift,
}: {
  action: (charge: ChargeRequest) => Promise<ChargeResult>;
  accounts: AccountOption[];
  suggestedCents: number;
  label: string;
  // Sin el módulo de Caja el cobro se registra sin turno.
  usesCashShift: boolean;
}) {
  return (
    <DialogButton
      label={label}
      className={secondaryButtonClass}
      title={label}
      description={usesCashShift ? "Entra al turno de caja abierto." : undefined}
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

type DeliverAction = (
  request: ChargeRequest & { refundMethod: string | null; warrantyId: string | null },
) => Promise<ChargeResult>;

// Garantías activas del catálogo; `null` si el equipo no quedó reparado (se entrega sin garantía).
type WarrantyOption = { id: string; name: string };

function WarrantyField({
  warranties,
  settingsHref,
  onChange,
}: {
  warranties: WarrantyOption[];
  settingsHref: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  if (warranties.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No hay garantías configuradas; el equipo se entrega sin garantía.
        {settingsHref && (
          <>
            {" "}
            <Link href={settingsHref} className="font-medium text-zinc-900 underline">
              Configurar garantías
            </Link>
          </>
        )}
      </p>
    );
  }
  return (
    <Field label="Garantía" name={`${id}-warranty`}>
      <Select
        id={`${id}-warranty`}
        options={warranties.map((warranty) => ({ value: warranty.id, label: warranty.name }))}
        placeholder="Elige la garantía…"
        onChange={onChange}
      />
    </Field>
  );
}

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
  warranties,
  warrantySettingsHref,
  onDone,
}: {
  action: DeliverAction;
  accounts: AccountOption[];
  totalCents: number;
  paidCents: number;
  canCollect: boolean;
  warranties: WarrantyOption[] | null;
  warrantySettingsHref: string | null;
  onDone: () => void;
}) {
  const balance = totalCents - paidCents;
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [warrantyId, setWarrantyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  // Con garantías en el catálogo, el equipo reparado no se entrega sin elegir una.
  const warrantyMissing = warranties !== null && warranties.length > 0 && !warrantyId;
  const warrantyField = warranties !== null && (
    <WarrantyField warranties={warranties} settingsHref={warrantySettingsHref} onChange={setWarrantyId} />
  );

  // Si la entrega se registra, la acción redirige; aquí solo llegan errores.
  const confirm = (request: Parameters<DeliverAction>[0]) =>
    startTransition(async () => {
      setError((await action(request))?.message ?? null);
    });

  if (balance > 0 && canCollect) {
    return (
      <div className="flex flex-col gap-4">
        <Totals totalCents={totalCents} paidCents={paidCents} />
        {warrantyField}
        <PaymentForm
          totalCents={balance}
          accounts={accounts}
          confirmLabel="Cobrar y entregar"
          onCancel={onDone}
          onConfirm={async (charge) =>
            warrantyMissing
              ? "Elige la garantía del equipo."
              : (await action({ ...charge, refundMethod: null, warrantyId }))?.message
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Totals totalCents={totalCents} paidCents={paidCents} />
      {(balance === 0 || (balance < 0 && canCollect)) && warrantyField}

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
          disabled={pending || warrantyMissing || balance > 0 || (balance < 0 && !canCollect)}
          onClick={() =>
            confirm({ payments: [], cashReceived: null, refundMethod: balance < 0 ? refundMethod : null, warrantyId })
          }
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
  warranties: WarrantyOption[] | null;
  // Enlace a Configuración → Garantías; solo para quien puede configurarlas.
  warrantySettingsHref: string | null;
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
  returnsToInventory,
  diagnosisFee,
  onDone,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  paidTotal: string;
  returnsToInventory: boolean;
  diagnosisFee: string | null;
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

      {paid && diagnosisFee && (
        <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          Se reembolsa también el diagnóstico ({formatMoney(diagnosisFee)}). Para cobrarlo, marca la orden como lista
          «Sin reparación» y entrégala en lugar de cancelarla.
        </p>
      )}

      <p className="text-xs text-zinc-500">
        {returnsToInventory ? "Las refacciones de la orden regresan al inventario. " : ""}No se puede deshacer.
      </p>

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
  returnsToInventory = true,
  diagnosisFee = null,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  paidTotal: string;
  // Sin el módulo de Inventario no hay existencias que regresar.
  returnsToInventory?: boolean;
  // Diagnóstico cobrado al recibir: al cancelar también se reembolsa.
  diagnosisFee?: string | null;
}) {
  return (
    <DialogButton
      label="Cancelar orden"
      className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
      title="Cancelar orden"
    >
      {(close) => (
        <CancelForm
          action={action}
          paidTotal={paidTotal}
          returnsToInventory={returnsToInventory}
          diagnosisFee={diagnosisFee}
          onDone={close}
        />
      )}
    </DialogButton>
  );
}
