"use client";

import { useRef, useState } from "react";
import { Field } from "@/components/ui/form";
import { DecimalInput } from "@/components/ui/money-input";
import { Select, type SelectOption } from "@/components/ui/select";
import { parseMoneyCents } from "@/lib/cash/form";
import { computeLine, fromCents } from "@/lib/cash/money";
import type { FormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/inventory/format";
import { searchRepairItemsAction, type RepairItemOption } from "@/lib/orders/actions";
import { LABOR_TAX_RATES } from "@/lib/orders/labels";

// Piezas compartidas para capturar refacciones: en el trabajo del técnico y al recibir el equipo.

export const MAX_QUANTITY = 1000;

// Si lo escrito supera el máximo, regresa al máximo; vacío se deja para seguir escribiendo.
export function clampQuantity(text: string, max: number) {
  const limit = Math.max(max, 1);
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value) || value <= limit) return text;
  return String(limit);
}

// Misma regla que el servidor: entero de 1 a 1000. null si aún no es válida.
export function parseQuantity(text: string) {
  return /^\d{1,4}$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_QUANTITY ? Number(text) : null;
}

// Búsqueda de refacciones del inventario para un AsyncSelect. Guarda cada artículo cargado para
// consultar sus existencias (y su precio, si se pueden ver) al elegirlo. Con `showPrices: false`
// no se muestra el precio aunque se pueda ver (refacciones por conseguir, cuyo precio puede cambiar).
export function useRepairItemSearch({ showPrices = true }: { showPrices?: boolean } = {}) {
  const items = useRef(new Map<string, RepairItemOption>());

  const loadOptions = async (query: string): Promise<SelectOption[]> =>
    (await searchRepairItemsAction(query)).map((item) => {
      items.current.set(item.id, item);
      const stock = item.trackStock ? (item.stock === 0 ? "Agotado" : `${item.stock} en existencia`) : "Sin control de existencias";
      return {
        value: item.id,
        label: item.name,
        detail: item.price === null || !showPrices ? stock : `${stock} · ${formatMoney(item.price)} con mano de obra`,
      };
    });

  return { loadOptions, find: (id: string) => items.current.get(id) ?? null };
}

// Precio e IVA de un renglón capturado a mano (mano de obra o refacción sin inventario).
// Muestra en vivo el desglose con el mismo cálculo que el servidor.
export function PriceTaxFields({
  id,
  state,
  priceLabel,
  quantity = 1,
}: {
  id: string;
  state: FormState;
  priceLabel: string;
  // Piezas del renglón; null si la cantidad aún no es válida.
  quantity?: number | null;
}) {
  const [price, setPrice] = useState(state?.fields?.price ?? "");
  const [taxRate, setTaxRate] = useState(state?.fields?.taxRate || "16");
  const [taxIncluded, setTaxIncluded] = useState(
    state?.selections?.taxIncluded ? state.selections.taxIncluded.length > 0 : true,
  );

  const priceCents = parseMoneyCents(price);
  const amounts =
    priceCents === null || quantity === null
      ? null
      : computeLine({ unitPriceCents: priceCents, quantity, taxRate: Number(taxRate), taxIncluded });
  const show = (cents: number | undefined) => (cents === undefined ? "—" : formatMoney(fromCents(cents)));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={priceLabel} name={`${id}-price`} error={state?.errors?.price}>
          <DecimalInput
            id={`${id}-price`}
            name="price"
            placeholder="0.00"
            value={price}
            onChange={setPrice}
            aria-describedby={`${id}-breakdown`}
          />
        </Field>
        <Field label="IVA" name={`${id}-tax`} error={state?.errors?.taxRate}>
          <Select
            id={`${id}-tax`}
            name="taxRate"
            options={LABOR_TAX_RATES.map((rate) => ({ value: rate, label: rate === "0" ? "Sin IVA" : `${rate}%` }))}
            defaultValue={taxRate}
            onChange={(value) => setTaxRate(value ?? "16")}
          />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="taxIncluded"
          checked={taxIncluded}
          onChange={(event) => setTaxIncluded(event.target.checked)}
          className="size-4 accent-zinc-900"
        />
        El precio ya incluye IVA
      </label>
      <dl
        id={`${id}-breakdown`}
        aria-live="polite"
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-zinc-500 tabular-nums"
      >
        <dt>Subtotal</dt>
        <dd className="text-right">{show(amounts?.subtotal)}</dd>
        <dt>IVA ({taxRate}%)</dt>
        <dd className="text-right">{show(amounts?.tax)}</dd>
        <dt className="font-medium text-zinc-700">Total</dt>
        <dd className="text-right font-medium text-zinc-700">{show(amounts?.total)}</dd>
      </dl>
    </>
  );
}
