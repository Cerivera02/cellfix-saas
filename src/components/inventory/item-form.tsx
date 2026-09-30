"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { DecimalInput, IntegerInput, MoneyInput } from "@/components/ui/money-input";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Select, type SelectOption } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";

export type ItemFormDefaults = {
  name: string;
  description: string;
  barcode: string;
  isForSale: boolean;
  isRepairPart: boolean;
  trackStock: boolean;
  categoryId: string;
  supplierId: string;
  purchasePrice: string;
  salePrice: string;
  laborPrice: string;
  taxRate: string;
  taxIncluded: boolean;
  minStock: string;
};

export function ItemForm({
  action,
  categories,
  suppliers,
  defaults,
  currentStock,
  withInitialStock,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: SelectOption[];
  suppliers: SelectOption[];
  defaults?: ItemFormDefaults;
  // Existencias actuales al editar, para avisar si se dejarán de controlar.
  currentStock?: number;
  withInitialStock: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const id = useId();

  const value = (key: Exclude<keyof ItemFormDefaults, "isForSale" | "isRepairPart" | "trackStock" | "taxIncluded">) =>
    state?.fields?.[key] ?? defaults?.[key];
  const kinds =
    state?.selections?.kinds ??
    (defaults ? [defaults.isForSale ? "sale" : "", defaults.isRepairPart ? "part" : ""] : ["sale"]);
  const [isPart, setIsPart] = useState(kinds.includes("part"));
  const submittedTrackStock =state?.selections?.trackStock ? state.selections.trackStock.length > 0 : undefined;
  const [trackStock, setTrackStock] = useState(submittedTrackStock ?? defaults?.trackStock ?? true);
  const willZeroStock = !trackStock && (defaults?.trackStock ?? true) && (currentStock ?? 0) > 0;
  const taxIncluded = state?.selections?.taxIncluded
    ? state.selections.taxIncluded.length > 0
    : (defaults?.taxIncluded ?? true);

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nombre" name={`${id}-name`} error={state?.errors?.name}>
            <input
              id={`${id}-name`}
              name="name"
              type="text"
              autoComplete="off"
              required
              maxLength={150}
              defaultValue={value("name")}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Descripción" name={`${id}-description`} hint="Opcional: modelo, color, compatibilidad…">
            <textarea
              id={`${id}-description`}
              name="description"
              rows={3}
              maxLength={1000}
              defaultValue={value("description")}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>

        <Field
          label="Código de barras"
          name={`${id}-barcode`}
          error={state?.errors?.barcode}
          hint="Opcional. Puedes escanearlo con un lector."
        >
          <input
            id={`${id}-barcode`}
            name="barcode"
            type="text"
            autoComplete="off"
            maxLength={64}
            defaultValue={value("barcode")}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-zinc-700">Tipo</legend>
          <div className="mt-2.5 flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="kinds"
                value="sale"
                defaultChecked={kinds.includes("sale")}
                className="size-4 accent-zinc-900"
              />
              Producto a la venta
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="kinds"
                value="part"
                defaultChecked={kinds.includes("part")}
                onChange={(event) => setIsPart(event.target.checked)}
                className="size-4 accent-zinc-900"
              />
              Refacción para reparaciones
            </label>
          </div>
          {state?.errors?.kinds && <p className="mt-1.5 text-xs text-red-600">{state.errors.kinds}</p>}
        </fieldset>

        <Field label="Categoría" name={`${id}-category`} error={state?.errors?.categoryId}>
          <Select
            id={`${id}-category`}
            name="categoryId"
            options={categories}
            defaultValue={value("categoryId")}
            placeholder="Sin categoría"
            isClearable
            isSearchable
          />
        </Field>

        <Field label="Proveedor principal" name={`${id}-supplier`} error={state?.errors?.supplierId}>
          <Select
            id={`${id}-supplier`}
            name="supplierId"
            options={suppliers}
            defaultValue={value("supplierId")}
            placeholder="Sin proveedor"
            isClearable
            isSearchable
          />
        </Field>
      </section>

      <section className="grid gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-2">
        <h2 className="text-sm font-medium text-zinc-900 sm:col-span-2">Precios y existencias</h2>

        <Field label="Precio de compra" name={`${id}-purchase`} error={state?.errors?.purchasePrice}>
          <MoneyInput id={`${id}-purchase`} name="purchasePrice" defaultValue={value("purchasePrice")} />
        </Field>

        <Field label="Precio de venta" name={`${id}-sale`} error={state?.errors?.salePrice}>
          <MoneyInput id={`${id}-sale`} name="salePrice" defaultValue={value("salePrice")} />
        </Field>

        {isPart && (
          <Field
            label="Mano de obra al instalarla"
            name={`${id}-labor`}
            error={state?.errors?.laborPrice}
            hint="Se cobra junto con la pieza en las órdenes. Los técnicos no ven este importe."
          >
            <MoneyInput id={`${id}-labor`} name="laborPrice" defaultValue={value("laborPrice")} />
          </Field>
        )}

        <Field label="IVA (%)" name={`${id}-tax`} error={state?.errors?.taxRate} hint="Usa 0 si el artículo no lleva IVA.">
          <DecimalInput id={`${id}-tax`} name="taxRate" defaultValue={value("taxRate") ?? "16"} />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 self-start rounded-lg border border-zinc-200 px-3.5 py-3 hover:bg-zinc-50 sm:mt-6">
          <input
            type="checkbox"
            name="taxIncluded"
            defaultChecked={taxIncluded}
            className="mt-0.5 size-4 shrink-0 accent-zinc-900"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">
              {isPart ? "Los precios ya incluyen IVA" : "El precio de venta ya incluye IVA"}
            </span>
            <span className="block text-xs text-zinc-500">Desmárcalo si el IVA debe sumarse al cobrar.</span>
          </span>
        </label>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3.5 py-3 hover:bg-zinc-50">
            <input
              type="checkbox"
              name="trackStock"
              defaultChecked={trackStock}
              onChange={(event) => setTrackStock(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-zinc-900"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">Controlar existencias</span>
              <span className="block text-xs text-zinc-500">
                Desactívalo para artículos que no se cuentan en el inventario, como servicios o consumibles.
              </span>
            </span>
          </label>
          {willZeroStock && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              {currentStock === 1
                ? "La unidad actual se pondrá en 0"
                : `Las ${currentStock} unidades actuales se pondrán en 0`}{" "}
              y quedará registrado en el historial.
            </p>
          )}
        </div>

        {trackStock && withInitialStock && (
          <Field
            label="Existencia inicial"
            name={`${id}-initial`}
            error={state?.errors?.initialStock}
            hint="Unidades que tienes hoy. Queda registrado en el historial."
          >
            <IntegerInput
              id={`${id}-initial`}
              name="initialStock"
              placeholder="0"
              defaultValue={state?.fields?.initialStock}
            />
          </Field>
        )}

        {trackStock && (
          <Field
            label="Stock mínimo"
            name={`${id}-min`}
            error={state?.errors?.minStock}
            hint="Al llegar a este número se marca como “Por agotarse”."
          >
            <IntegerInput id={`${id}-min`} name="minStock" placeholder="0" defaultValue={value("minStock")} />
          </Field>
        )}
      </section>

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <Link href={cancelHref} className={secondaryButtonClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
