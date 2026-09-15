"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import type { AccountOption } from "@/components/cash/payment-dialog";
import { MoneyTextInput } from "@/components/cash/money-text-input";
import {
  SupplierPaymentsEditor,
  newPaymentRow,
  type SupplierPaymentRow,
} from "@/components/purchases/supplier-payments-editor";
import {
  Field,
  dangerGhostButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { AsyncSelect, Select, type SelectOption } from "@/components/ui/select";
import { parseMoneyCents } from "@/lib/cash/form";
import { fromCents } from "@/lib/cash/money";
import { formatMoney } from "@/lib/inventory/format";
import { searchOrdersAction } from "@/lib/orders/actions";
import { createPurchaseAction, searchPurchaseItemsAction } from "@/lib/purchases/actions";
import type { PurchasableItem } from "@/lib/purchases/core";
import { PURCHASE_TERMS_LABELS, type PurchaseTerms } from "@/lib/purchases/labels";

type Line = { key: number; item: PurchasableItem; quantity: string; unitCost: string; order: SelectOption | null };

export function PurchaseForm({
  suppliers,
  accounts,
  drawerAvailable,
  today,
  defaultOrder,
}: {
  suppliers: SelectOption[];
  accounts: AccountOption[];
  drawerAvailable: boolean;
  today: string;
  defaultOrder: SelectOption | null;
}) {
  const id = useId();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchasedOn, setPurchasedOn] = useState(today);
  const [terms, setTerms] = useState<PurchaseTerms>("cash");
  const [dueOn, setDueOn] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Resultados de la última búsqueda, para recuperar existencias y costo del artículo elegido.
  const [found, setFound] = useState<PurchasableItem[]>([]);

  const loadItems = async (query: string) => {
    const items = await searchPurchaseItemsAction(query);
    setFound(items);
    return items.map((item) => ({
      value: item.id,
      label: item.name,
      detail: `${item.stock} en existencia · último costo ${formatMoney(item.purchasePrice)}`,
    }));
  };

  const addItem = (option: SelectOption | null) => {
    const item = found.find((candidate) => candidate.id === option?.value);
    if (!item) return;
    setLines((current) => [
      ...current,
      {
        key: Math.max(0, ...current.map((line) => line.key)) + 1,
        item,
        quantity: "1",
        unitCost: item.purchasePrice,
        order: defaultOrder,
      },
    ]);
  };

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const lineTotals = lines.map((line) => {
    const quantity = /^\d{1,6}$/.test(line.quantity) ? Number(line.quantity) : null;
    const cost = parseMoneyCents(line.unitCost);
    return quantity !== null && quantity > 0 && cost !== null ? quantity * cost : null;
  });
  const totalCents = lineTotals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const paymentCents = payments.map((payment) => parseMoneyCents(payment.amount));
  const paidCents = paymentCents.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  let blocker: string | null = null;
  if (!supplierId) blocker = "Elige el proveedor.";
  else if (lines.length === 0) blocker = "Agrega los artículos que llegaron.";
  else if (lineTotals.some((value) => value === null)) blocker = "Revisa cantidades y costos.";
  else if (totalCents <= 0) blocker = "El total de la compra debe ser mayor a 0.";
  else if (paymentCents.some((value) => value === null || value <= 0)) blocker = "Revisa los importes de pago.";
  else if (terms === "cash" && paidCents !== totalCents) {
    blocker =
      paidCents < totalCents
        ? `De contado se paga completa: falta registrar ${formatMoney(fromCents(totalCents - paidCents))}.`
        : `Los pagos exceden el total por ${formatMoney(fromCents(paidCents - totalCents))}.`;
  } else if (terms === "credit" && paidCents > totalCents) blocker = "Los abonos superan el total de la compra.";

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPurchaseAction({
        supplierId: supplierId ?? "",
        invoiceNumber,
        purchasedOn,
        terms,
        dueOn: terms === "credit" ? dueOn : "",
        notes,
        lines: lines.map((line) => ({
          itemId: line.item.id,
          quantity: Number(line.quantity),
          unitCost: line.unitCost,
          repairOrderId: line.order?.value ?? null,
        })),
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          bankAccountId: payment.bankAccountId,
          reference: payment.reference,
          fromDrawer: payment.fromDrawer,
        })),
      });
      // Si la compra se registró, la acción redirige; aquí solo llegan errores.
      if (result?.message) setError(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Proveedor" name={`${id}-supplier`}>
            <Select
              id={`${id}-supplier`}
              options={suppliers}
              placeholder="Elige el proveedor"
              isSearchable
              onChange={setSupplierId}
            />
          </Field>
          {suppliers.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              No hay proveedores activos.{" "}
              <Link href="/dashboard/inventory/suppliers" className="underline">
                Regístralos aquí
              </Link>
              .
            </p>
          )}
        </div>
        <Field label="Fecha de compra" name={`${id}-date`}>
          <input
            id={`${id}-date`}
            type="date"
            value={purchasedOn}
            onChange={(event) => setPurchasedOn(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Folio de factura o nota" name={`${id}-invoice`} hint="Opcional.">
          <input
            id={`${id}-invoice`}
            type="text"
            autoComplete="off"
            maxLength={60}
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notas" name={`${id}-notes`} hint="Opcional.">
            <input
              id={`${id}-notes`}
              type="text"
              autoComplete="off"
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="border-t border-zinc-100 pt-6">
        <h2 className="text-sm font-medium text-zinc-900">Artículos recibidos</h2>
        <div className="mt-3">
          <AsyncSelect
            id={`${id}-search`}
            value={null}
            onChange={addItem}
            loadOptions={loadItems}
            placeholder="Busca por nombre o código de barras para agregarlo"
          />
        </div>

        {lines.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
            Solo aparecen artículos que controlan existencias. Si el artículo no existe, créalo primero en Inventario.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {lines.map((line, index) => (
              <li key={line.key} className="rounded-xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{line.item.name}</p>
                    <p className="text-xs text-zinc-500">{line.item.stock} en existencia</p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {lineTotals[index] === null ? "—" : formatMoney(fromCents(lineTotals[index] ?? 0))}
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[6rem_9rem_1fr]">
                  <Field label="Cantidad" name={`${id}-qty-${line.key}`}>
                    <input
                      id={`${id}-qty-${line.key}`}
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      className={`${inputClass} tabular-nums`}
                    />
                  </Field>
                  <Field label="Costo por pieza" name={`${id}-cost-${line.key}`}>
                    <MoneyTextInput
                      id={`${id}-cost-${line.key}`}
                      value={line.unitCost}
                      onChange={(value) => updateLine(line.key, { unitCost: value })}
                    />
                  </Field>
                  <Field label="Para la orden" name={`${id}-order-${line.key}`}>
                    <AsyncSelect
                      id={`${id}-order-${line.key}`}
                      value={line.order}
                      onChange={(order) => updateLine(line.key, { order })}
                      loadOptions={searchOrdersAction}
                      placeholder="Opcional"
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  className={`mt-2 ${dangerGhostButtonClass}`}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-zinc-50 px-4 py-3">
          <span className="text-sm text-zinc-600">Total de la compra</span>
          <span className="text-xl font-semibold tabular-nums">{formatMoney(fromCents(totalCents))}</span>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-zinc-100 pt-6">
        <h2 className="text-sm font-medium text-zinc-900">Pago</h2>
        <div role="radiogroup" aria-label="Forma de pago" className="grid gap-2 sm:grid-cols-2">
          {(["cash", "credit"] as const).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 px-3.5 py-3 has-checked:border-zinc-900 has-checked:ring-1 has-checked:ring-zinc-900"
            >
              <input
                type="radio"
                name={`${id}-terms`}
                checked={terms === option}
                onChange={() => setTerms(option)}
                className="mt-0.5 accent-zinc-900"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">{PURCHASE_TERMS_LABELS[option]}</span>
                <span className="block text-xs text-zinc-500">
                  {option === "cash"
                    ? "Se paga completa al recibirla."
                    : "El proveedor nos dio crédito: queda un saldo que se abona después."}
                </span>
              </span>
            </label>
          ))}
        </div>

        {terms === "credit" && (
          <Field label="Fecha límite de pago" name={`${id}-due`} hint="Opcional.">
            <input
              id={`${id}-due`}
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
              className={`${inputClass} sm:w-56`}
            />
          </Field>
        )}

        <SupplierPaymentsEditor
          rows={payments}
          onChange={setPayments}
          accounts={accounts}
          drawerAvailable={drawerAvailable}
          nextAmountCents={Math.max(totalCents - paidCents, 0)}
          addLabel={terms === "cash" ? "Agregar pago" : "Agregar abono inicial"}
        />

        <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-600">Pagado</span>
            <span className="tabular-nums">{formatMoney(fromCents(paidCents))}</span>
          </div>
          {terms === "credit" && (
            <div className="mt-1 flex justify-between font-medium">
              <span>Queda a crédito</span>
              <span className="tabular-nums">{formatMoney(fromCents(Math.max(totalCents - paidCents, 0)))}</span>
            </div>
          )}
        </div>
      </section>

      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {error ?? (lines.length > 0 || payments.length > 0 ? blocker : null)}
      </p>

      <div className="flex justify-end gap-3">
        <Link href="/dashboard/purchases" className={secondaryButtonClass}>
          Cancelar
        </Link>
        {terms === "cash" && payments.length === 0 && totalCents > 0 ? (
          <button
            type="button"
            onClick={() => setPayments([newPaymentRow([], totalCents, drawerAvailable)])}
            className={primaryButtonClass}
          >
            Capturar pago
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={pending || blocker !== null} className={primaryButtonClass}>
            {pending ? "Registrando…" : "Registrar compra"}
          </button>
        )}
      </div>
    </div>
  );
}
