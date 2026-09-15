"use client";

import { useState, useTransition } from "react";
import type { AccountOption } from "@/components/cash/payment-dialog";
import {
  SupplierPaymentsEditor,
  newPaymentRow,
  type SupplierPaymentRow,
} from "@/components/purchases/supplier-payments-editor";
import { DialogButton } from "@/components/ui/dialog-button";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { parseMoneyCents } from "@/lib/cash/form";
import { fromCents } from "@/lib/cash/money";
import { formatMoney } from "@/lib/inventory/format";
import type { SupplierPaymentRequest } from "@/lib/purchases/actions";

type Action = (request: { payments: SupplierPaymentRequest[] }) => Promise<{ message?: string; success?: string }>;

function PaymentContent({
  action,
  balanceCents,
  accounts,
  drawerAvailable,
  onDone,
}: {
  action: Action;
  balanceCents: number;
  accounts: AccountOption[];
  drawerAvailable: boolean;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<SupplierPaymentRow[]>(() => [newPaymentRow([], balanceCents, drawerAvailable)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amounts = rows.map((row) => parseMoneyCents(row.amount));
  const paid = amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  let blocker: string | null = null;
  if (rows.length === 0) blocker = "Agrega el pago.";
  else if (amounts.some((value) => value === null || value <= 0)) blocker = "Revisa los importes.";
  else if (paid > balanceCents) blocker = `El abono excede el saldo (${formatMoney(fromCents(balanceCents))}).`;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await action({
        payments: rows.map((row) => ({
          method: row.method,
          amount: row.amount,
          bankAccountId: row.bankAccountId,
          reference: row.reference,
          fromDrawer: row.fromDrawer,
        })),
      });
      if (result.success) onDone();
      else setError(result.message ?? null);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SupplierPaymentsEditor
        rows={rows}
        onChange={setRows}
        accounts={accounts}
        drawerAvailable={drawerAvailable}
        nextAmountCents={Math.max(balanceCents - paid, 0)}
        addLabel="Agregar otro método"
      />
      <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-600">Saldo actual</span>
          <span className="tabular-nums">{formatMoney(fromCents(balanceCents))}</span>
        </div>
        <div className="mt-1 flex justify-between font-medium">
          <span>Saldo después del abono</span>
          <span className="tabular-nums">{formatMoney(fromCents(Math.max(balanceCents - paid, 0)))}</span>
        </div>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {error ?? blocker}
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="button" onClick={submit} disabled={pending || blocker !== null} className={primaryButtonClass}>
          {pending ? "Registrando…" : "Registrar abono"}
        </button>
      </div>
    </div>
  );
}

export function PurchasePaymentDialog(props: {
  action: Action;
  balanceCents: number;
  accounts: AccountOption[];
  drawerAvailable: boolean;
}) {
  return (
    <DialogButton
      label="Registrar abono"
      className={primaryButtonClass}
      title="Registrar abono"
      description="Pago al saldo de esta compra."
      size="lg"
    >
      {(close) => <PaymentContent {...props} onDone={close} />}
    </DialogButton>
  );
}
