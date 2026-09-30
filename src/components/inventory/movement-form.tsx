"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { IntegerInput, MoneyInput } from "@/components/ui/money-input";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Select, type SelectOption } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";

const TYPE_OPTIONS: SelectOption[] = [
  { value: "purchase", label: "Entrada por compra" },
  { value: "adjustment_in", label: "Ajuste: entrada" },
  { value: "adjustment_out", label: "Ajuste: salida" },
];

export function MovementForm({
  action,
  suppliers,
  defaultSupplierId,
  purchasePrice,
  onSuccess,
  onCancel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  suppliers: SelectOption[];
  defaultSupplierId: string | null;
  purchasePrice: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onSuccess();
    return result;
  }, undefined);
  const [type, setType] = useState("purchase");
  const id = useId();
  const fields = state?.fields;
  const isPurchase = type === "purchase";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Tipo de movimiento" name={`${id}-type`} error={state?.errors?.movementType}>
        <Select
          id={`${id}-type`}
          name="movementType"
          options={TYPE_OPTIONS}
          defaultValue="purchase"
          onChange={(value) => setType(value ?? "purchase")}
        />
      </Field>

      <Field
        label="Cantidad"
        name={`${id}-quantity`}
        error={state?.errors?.quantity}
        hint={type === "adjustment_out" ? "Unidades que salen del inventario." : "Unidades que entran al inventario."}
      >
        <IntegerInput id={`${id}-quantity`} name="quantity" required defaultValue={fields?.quantity} />
      </Field>

      {isPurchase ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Costo unitario" name={`${id}-cost`} error={state?.errors?.unitCost} hint="Opcional.">
              <MoneyInput id={`${id}-cost`} name="unitCost" defaultValue={fields?.unitCost ?? purchasePrice} />
            </Field>
            <Field label="Proveedor" name={`${id}-supplier`} error={state?.errors?.supplierId}>
              <Select
                id={`${id}-supplier`}
                name="supplierId"
                options={suppliers}
                defaultValue={fields?.supplierId ?? defaultSupplierId ?? undefined}
                placeholder="Sin proveedor"
                isClearable
                isSearchable
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="updatePurchasePrice"
              defaultChecked={state?.selections?.updatePurchasePrice ? state.selections.updatePurchasePrice.length > 0 : true}
              className="size-4 accent-zinc-900"
            />
            Actualizar el precio de compra del artículo con este costo
          </label>

          <Field label="Nota" name={`${id}-note`} hint="Opcional: número de factura, etc.">
            <input
              id={`${id}-note`}
              name="note"
              type="text"
              autoComplete="off"
              maxLength={300}
              defaultValue={fields?.note}
              className={inputClass}
            />
          </Field>
        </>
      ) : (
        <Field
          label="Motivo"
          name={`${id}-note`}
          error={state?.errors?.note}
          hint="Por ejemplo: conteo físico, pieza dañada o extraviada."
        >
          <input
            id={`${id}-note`}
            name="note"
            type="text"
            autoComplete="off"
            required
            maxLength={300}
            defaultValue={fields?.note}
            className={inputClass}
          />
        </Field>
      )}

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
