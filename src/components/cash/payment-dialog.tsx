"use client";

import { useId, useRef, useState, useTransition } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Field,
  dangerGhostButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { createSaleAction, type SaleRequest } from "@/lib/cash/actions";
import { parseMoneyCents } from "@/lib/cash/form";
import { describeAccount, formatClabe } from "@/lib/cash/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/cash/labels";
import { fromCents } from "@/lib/cash/money";
import type { ChargeRequest } from "@/lib/cash/payment-request";
import { formatMoney } from "@/lib/inventory/format";

export type AccountOption = { id: string; bankName: string; holderName: string; clabe: string; alias: string };

type PaymentRow = {
  key: number;
  method: PaymentMethod;
  amount: string;
  bankAccountId: string | null;
  reference: string;
};

function initialRows(totalCents: number, exact: boolean, key = 1): PaymentRow[] {
  return totalCents > 0 || !exact
    ? [{ key, method: "cash", amount: totalCents > 0 ? fromCents(totalCents) : "", bankAccountId: null, reference: "" }]
    : [];
}

// Estado de los pagos combinados de un cobro. Con `exact` los pagos deben sumar `totalCents`
// (ventas, saldo al entregar); sin él se cobra el importe que se capture (anticipos).
// `totalCents` puede cambiar entre renders; los renglones iniciales usan el primero.
export function usePaymentRows({ totalCents, exact }: { totalCents: number; exact: boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>(() => initialRows(totalCents, exact));
  // Llaves siempre nuevas: los selects (no controlados) de un renglón recreado se vuelven a montar.
  const lastKey = useRef(1);
  const nextKey = () => {
    lastKey.current += 1;
    return lastKey.current;
  };
  const [cashReceived, setCashReceived] = useState(totalCents > 0 ? fromCents(totalCents) : "");

  const amounts = rows.map((row) => parseMoneyCents(row.amount));
  const paidCents = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const remainingCents = totalCents - paidCents;
  const cashRow = rows.find((row) => row.method === "cash");
  const cashCents = cashRow ? (parseMoneyCents(cashRow.amount) ?? 0) : 0;
  const receivedCents = cashRow ? parseMoneyCents(cashReceived) : null;
  const changeCents = cashRow && receivedCents !== null ? receivedCents - cashCents : 0;

  let blocker: string | null = null;
  if (amounts.some((amount) => amount === null || amount <= 0)) blocker = "Revisa los importes de pago.";
  else if (exact && remainingCents > 0) blocker = `Falta cubrir ${formatMoney(fromCents(remainingCents))}.`;
  else if (exact && remainingCents < 0) {
    blocker = `Los pagos exceden el total por ${formatMoney(fromCents(-remainingCents))}.`;
  } else if (rows.some((row) => row.method === "transfer" && !row.bankAccountId)) {
    blocker = "Elige la cuenta que recibe la transferencia.";
  } else if (cashRow && (receivedCents === null || receivedCents < cashCents)) {
    blocker = "El efectivo recibido no cubre el pago en efectivo.";
  }

  const updateRow = (key: number, patch: Partial<PaymentRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    const key = nextKey();
    setRows((current) => [
      ...current,
      {
        key,
        method: current.some((row) => row.method === "cash") ? "debit_card" : "cash",
        amount: exact ? fromCents(Math.max(remainingCents, 0)) : "",
        bankAccountId: null,
        reference: "",
      },
    ]);
  };

  const removeRow = (key: number) => setRows((current) => current.filter((item) => item.key !== key));

  const setAmount = (row: PaymentRow, value: string) => {
    updateRow(row.key, { amount: value });
    if (!exact && row.method === "cash") setCashReceived(value);
  };

  const setMethod = (row: PaymentRow, method: PaymentMethod) => {
    updateRow(row.key, { method, bankAccountId: null, reference: "" });
    if (method === "cash") setCashReceived(row.amount);
  };

  // Vuelve a un solo pago en efectivo por `cents` (vacío si es 0), por ejemplo al cambiar el tipo de cobro.
  const reset = (cents: number) => {
    setRows(initialRows(cents, false, nextKey()));
    setCashReceived(cents > 0 ? fromCents(cents) : "");
  };

  // Con un solo pago, lo ajusta al nuevo importe a cobrar sin cambiar el método.
  const setTotal = (cents: number) => {
    if (rows.length !== 1) return;
    const amount = cents > 0 ? fromCents(cents) : "";
    updateRow(rows[0].key, { amount });
    if (rows[0].method === "cash") setCashReceived(amount);
  };

  const toCharge = (): ChargeRequest => ({
    payments: rows.map((row) => ({
      method: row.method,
      amount: row.amount,
      bankAccountId: row.bankAccountId,
      reference: row.reference,
    })),
    cashReceived: cashRow ? cashReceived : null,
  });

  return {
    rows,
    cashReceived,
    setCashReceived,
    paidCents,
    changeCents,
    hasCash: Boolean(cashRow),
    blocker,
    updateRow,
    addRow,
    removeRow,
    setAmount,
    setMethod,
    reset,
    setTotal,
    toCharge,
  };
}

export type PaymentRowsState = ReturnType<typeof usePaymentRows>;

// Renglones de pago (método, importe, efectivo recibido, cuenta y referencia) de un cobro.
// Se usa dentro de PaymentForm y en formularios que cobran al guardar, como la recepción de equipos.
export function PaymentRowsFields({
  state,
  accounts,
  canAddRows,
}: {
  state: PaymentRowsState;
  accounts: AccountOption[];
  canAddRows: boolean;
}) {
  const id = useId();
  const { rows, cashReceived, setCashReceived, changeCents, hasCash, updateRow } = state;

  return (
    <>
      {rows.map((row, index) => {
        const account = accounts.find((option) => option.id === row.bankAccountId);
        const methodOptions = PAYMENT_METHODS.filter(
          (method) => method !== "cash" || row.method === "cash" || !hasCash,
        ).map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }));

        return (
          <div key={row.key} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <Field label={rows.length > 1 ? `Pago ${index + 1}` : "Método de pago"} name={`${id}-method-${row.key}`}>
                <Select
                  id={`${id}-method-${row.key}`}
                  options={methodOptions}
                  defaultValue={row.method}
                  onChange={(value) => {
                    if (value) state.setMethod(row, value as PaymentMethod);
                  }}
                />
              </Field>
              <Field label="Importe" name={`${id}-amount-${row.key}`}>
                <MoneyInput
                  id={`${id}-amount-${row.key}`}
                  value={row.amount}
                  onChange={(value) => state.setAmount(row, value)}
                />
              </Field>
            </div>

            {row.method === "cash" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Efectivo recibido" name={`${id}-received`}>
                  <MoneyInput id={`${id}-received`} value={cashReceived} onChange={setCashReceived} />
                </Field>
                <div className="flex flex-col justify-end">
                  <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Cambio</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {formatMoney(fromCents(Math.max(changeCents, 0)))}
                  </p>
                </div>
              </div>
            )}

            {row.method === "transfer" &&
              (accounts.length === 0 ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                  No hay cuentas bancarias registradas. Agrégalas en Configuración → Cuentas bancarias.
                </p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Cuenta que recibe" name={`${id}-account-${row.key}`}>
                    <Select
                      id={`${id}-account-${row.key}`}
                      options={accounts.map((option) => ({ value: option.id, label: describeAccount(option) }))}
                      placeholder="Elige la cuenta"
                      onChange={(value) => updateRow(row.key, { bankAccountId: value })}
                    />
                  </Field>
                  <Field label="Referencia" name={`${id}-reference-${row.key}`} hint="Opcional: folio o clave de rastreo.">
                    <input
                      id={`${id}-reference-${row.key}`}
                      type="text"
                      autoComplete="off"
                      maxLength={60}
                      value={row.reference}
                      onChange={(event) => updateRow(row.key, { reference: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  {account && (
                    <div className="rounded-lg bg-zinc-50 px-3.5 py-3 text-sm sm:col-span-2">
                      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Datos para el cliente</p>
                      <p className="mt-1 font-medium text-zinc-900">{account.bankName}</p>
                      <p className="text-zinc-700">{account.holderName}</p>
                      <p className="font-mono text-zinc-900">CLABE {formatClabe(account.clabe)}</p>
                    </div>
                  )}
                </div>
              ))}

            {(row.method === "debit_card" || row.method === "credit_card") && (
              <div className="mt-3">
                <Field
                  label="Referencia"
                  name={`${id}-reference-${row.key}`}
                  hint="Opcional: últimos 4 dígitos o número de autorización."
                >
                  <input
                    id={`${id}-reference-${row.key}`}
                    type="text"
                    autoComplete="off"
                    maxLength={60}
                    value={row.reference}
                    onChange={(event) => updateRow(row.key, { reference: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}

            {rows.length > 1 && (
              <button type="button" onClick={() => state.removeRow(row.key)} className={`mt-3 ${dangerGhostButtonClass}`}>
                Quitar este pago
              </button>
            )}
          </div>
        );
      })}

      {canAddRows && (
        <button type="button" onClick={state.addRow} className={`self-start ${secondaryButtonClass}`}>
          Agregar otro método de pago
        </button>
      )}
    </>
  );
}

// Formulario de cobro con pagos combinados. Con `exact` los pagos deben sumar `totalCents`
// (ventas, saldo al entregar); sin él se cobra el importe que se capture (anticipos).
// `onConfirm` devuelve un mensaje de error o nada si el cobro se registró.
export function PaymentForm({
  totalCents,
  accounts,
  exact = true,
  confirmLabel = "Confirmar cobro",
  onConfirm,
  onCancel,
}: {
  totalCents: number;
  accounts: AccountOption[];
  exact?: boolean;
  confirmLabel?: string;
  onConfirm: (charge: ChargeRequest) => Promise<string | null | undefined>;
  onCancel: () => void;
}) {
  const payment = usePaymentRows({ totalCents, exact });
  const { rows, paidCents, blocker } = payment;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const message = await onConfirm(payment.toCharge());
      if (message) setError(message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <PaymentRowsFields state={payment} accounts={accounts} canAddRows={totalCents > 0 || !exact} />

      <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm">
        {exact ? (
          <>
            <div className="flex justify-between">
              <span className="text-zinc-600">Total</span>
              <span className="font-medium tabular-nums">{formatMoney(fromCents(totalCents))}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-zinc-600">Pagado</span>
              <span className="tabular-nums">{formatMoney(fromCents(paidCents))}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <span className="text-zinc-600">Importe a cobrar</span>
            <span className="font-medium tabular-nums">{formatMoney(fromCents(paidCents))}</span>
          </div>
        )}
      </div>

      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {error ?? (blocker && rows.length > 0 ? blocker : null)}
      </p>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="button" onClick={submit} disabled={pending || blocker !== null} className={primaryButtonClass}>
          {pending ? "Registrando…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function PaymentDialog({
  open,
  onClose,
  totalCents,
  accounts,
  sale,
}: {
  open: boolean;
  onClose: () => void;
  totalCents: number;
  accounts: AccountOption[];
  sale: Pick<SaleRequest, "customerId" | "lines">;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cobrar"
      description={`Total a cobrar: ${formatMoney(fromCents(totalCents))}`}
      size="lg"
    >
      {/* Se monta al abrir: cada cobro empieza con el total actual. */}
      {open && (
        <PaymentForm
          totalCents={totalCents}
          accounts={accounts}
          onCancel={onClose}
          // Si la venta se registró, la acción redirige; aquí solo llegan errores.
          onConfirm={async (charge) => (await createSaleAction({ ...sale, ...charge }))?.message}
        />
      )}
    </Modal>
  );
}
