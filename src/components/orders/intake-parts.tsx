"use client";

import { useRef, useState } from "react";
import {
  MAX_QUANTITY,
  PriceTaxFields,
  clampQuantity,
  parseQuantity,
  useRepairItemSearch,
} from "@/components/orders/part-fields";
import { Field, ghostButtonClass, inputClass } from "@/components/ui/form";
import { IntegerInput } from "@/components/ui/money-input";
import { AsyncSelect, type SelectOption } from "@/components/ui/select";
import { fromCents, toCents } from "@/lib/cash/money";
import type { FormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/inventory/format";

// Refacciones que se anotan al recibir el equipo: las que se cambiarán (en existencia) y las que
// hay que conseguir.

type ChosenPart = {
  itemId: string;
  name: string;
  quantity: string;
  // Existencias; null si el artículo no lleva control de existencias.
  stock: number | null;
  // Precio por pieza con mano de obra e IVA; null si no se pueden ver precios.
  price: string | null;
};

const MAX_PARTS = 20;

// Refacción en existencia con el módulo de Inventario: se eligen artículos (uno o más) y la
// cantidad se limita a las existencias. Viajan como JSON en `intakeParts`; el precio lo pone el servidor.
export function IntakeStockParts({ id, error }: { id: string; error?: string }) {
  const { loadOptions, find } = useRepairItemSearch();
  const [parts, setParts] = useState<ChosenPart[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const choose = (option: SelectOption | null) => {
    const item = option ? find(option.value) : null;
    if (!item) return;
    if (parts.some((part) => part.itemId === item.id)) {
      setNotice(`${item.name} ya está en la lista.`);
      return;
    }
    if (item.trackStock && item.stock === 0) {
      setNotice(`No hay existencias de ${item.name}. Si hay que pedirla, elige “Refacción por conseguir”.`);
      return;
    }
    if (parts.length >= MAX_PARTS) {
      setNotice(`Se pueden agregar hasta ${MAX_PARTS} refacciones.`);
      return;
    }
    setNotice(null);
    setParts([
      ...parts,
      { itemId: item.id, name: item.name, quantity: "1", stock: item.trackStock ? item.stock : null, price: item.price },
    ]);
  };

  const limitOf = (part: ChosenPart) => Math.min(part.stock ?? MAX_QUANTITY, MAX_QUANTITY);
  const setQuantity = (itemId: string, text: string, onBlur = false) =>
    setParts((current) =>
      current.map((part) => {
        if (part.itemId !== itemId) return part;
        const quantity = clampQuantity(text, limitOf(part));
        // Al salir del campo, una cantidad vacía o no válida vuelve a 1.
        return { ...part, quantity: onBlur && parseQuantity(quantity) === null ? "1" : quantity };
      }),
    );
  const remove = (itemId: string) => setParts((current) => current.filter((part) => part.itemId !== itemId));

  const showPrices = parts.length > 0 && parts.every((part) => part.price !== null);
  const totalCents = parts.reduce(
    (total, part) => total + (part.price === null ? 0 : toCents(part.price) * (parseQuantity(part.quantity) ?? 0)),
    0,
  );
  // Una cantidad vacía o no válida se envía como 0 para que el servidor la rechace, en lugar de
  // descontar y cobrar una pieza que la pantalla no mostraba.
  const payload = JSON.stringify(
    parts.map((part) => ({ itemId: part.itemId, quantity: parseQuantity(part.quantity) ?? 0 })),
  );

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Refacción a cambiar"
        name={`${id}-part`}
        error={error}
        hint="Se descuenta del inventario al registrar la orden; si se cancela, regresa."
      >
        <AsyncSelect
          id={`${id}-part`}
          value={null}
          onChange={choose}
          loadOptions={loadOptions}
          placeholder="Busca por nombre o código de barras"
          invalid={Boolean(error)}
        />
      </Field>
      {notice && <p className="text-xs text-amber-700">{notice}</p>}

      {parts.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {parts.map((part) => (
            <li key={part.itemId} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-zinc-900">{part.name}</p>
                <p className="text-xs text-zinc-500">
                  {part.stock === null ? "Sin control de existencias" : `${part.stock} en existencia`}
                  {part.price !== null && ` · ${formatMoney(part.price)} c/u con mano de obra`}
                </p>
              </div>
              <label className="sr-only" htmlFor={`${id}-qty-${part.itemId}`}>
                Cantidad de {part.name}
              </label>
              <IntegerInput
                id={`${id}-qty-${part.itemId}`}
                placeholder="1"
                max={Math.max(limitOf(part), 1)}
                value={part.quantity}
                onChange={(value) => setQuantity(part.itemId, value)}
                onBlur={(event) => setQuantity(part.itemId, event.currentTarget.value, true)}
                className="w-20"
              />
              <button type="button" onClick={() => remove(part.itemId)} className={ghostButtonClass}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {showPrices && (
        <p className="text-sm text-zinc-700">
          Total de la refacción: <span className="font-medium tabular-nums">{formatMoney(fromCents(totalCents))}</span>
        </p>
      )}

      <input type="hidden" name="intakeParts" value={parts.length > 0 ? payload : ""} />
    </div>
  );
}

// Refacción en existencia sin el módulo de Inventario: se describe a mano, como en la orden.
// Quien no ve precios la registra sin importe.
export function IntakeFreePart({ id, state, showPrices }: { id: string; state: FormState; showPrices: boolean }) {
  const [description, setDescription] = useState(state?.fields?.partDescription ?? "");
  const [quantity, setQuantity] = useState(state?.fields?.partQuantity || "1");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Refacción a cambiar" name={`${id}-part`} error={state?.errors?.partDescription}>
          <input
            id={`${id}-part`}
            name="partDescription"
            type="text"
            autoComplete="off"
            maxLength={150}
            placeholder="Pantalla, batería, centro de carga…"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Cantidad" name={`${id}-part-quantity`} error={state?.errors?.partQuantity}>
          <IntegerInput
            id={`${id}-part-quantity`}
            placeholder="1"
            name="partQuantity"
            max={MAX_QUANTITY}
            value={quantity}
            onChange={setQuantity}
          />
        </Field>
      </div>
      {showPrices && (
        <PriceTaxFields id={`${id}-part`} state={state} priceLabel="Precio por pieza" quantity={parseQuantity(quantity)} />
      )}
    </div>
  );
}

type PartToGet = {
  key: number;
  // null si se describió a mano.
  itemId: string | null;
  description: string;
  quantity: string;
  // Existencias como referencia; null si no lleva control o no se conocen (al volver con errores).
  stock: number | null;
};

// Lista enviada antes de un error de validación, para no perderla al volver al formulario.
function restorePartsToGet(raw: string | undefined): PartToGet[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_PARTS).flatMap((entry, index) =>
      typeof entry?.description === "string" && entry.description
        ? [
            {
              key: index,
              itemId: typeof entry.itemId === "string" ? entry.itemId : null,
              description: entry.description.slice(0, 150),
              quantity: String(parseQuantity(String(entry.quantity)) ?? 1),
              stock: null,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

// Refacción por conseguir: piezas del inventario (aunque estén agotadas) o descritas a mano, con su
// cantidad y sin precio, porque puede cambiar al conseguirlas. No se agregan a la orden ni mueven
// existencias. Viajan como JSON en `partsToGet`; de los artículos, el nombre lo pone el servidor.
export function IntakePartsToGet({ id, state, hasInventory }: { id: string; state: FormState; hasInventory: boolean }) {
  const { loadOptions, find } = useRepairItemSearch({ showPrices: false });
  const [parts, setParts] = useState<PartToGet[]>(() => restorePartsToGet(state?.fields?.partsToGet));
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const nextKey = useRef(parts.length);
  const error = state?.errors?.partsToGet;

  const add = (part: Omit<PartToGet, "key" | "quantity">) => {
    if (parts.length >= MAX_PARTS) {
      setNotice(`Se pueden agregar hasta ${MAX_PARTS} refacciones.`);
      return false;
    }
    setNotice(null);
    setParts([...parts, { ...part, key: nextKey.current++, quantity: "1" }]);
    return true;
  };

  const choose = (option: SelectOption | null) => {
    const item = option ? find(option.value) : null;
    if (!item) return;
    if (parts.some((part) => part.itemId === item.id)) {
      setNotice(`${item.name} ya está en la lista.`);
      return;
    }
    add({ itemId: item.id, description: item.name, stock: item.trackStock ? item.stock : null });
  };

  const addText = () => {
    const description = text.trim();
    if (!description) return;
    if (add({ itemId: null, description, stock: null })) setText("");
  };

  const setQuantity = (key: number, value: string, onBlur = false) =>
    setParts((current) =>
      current.map((part) => {
        if (part.key !== key) return part;
        const quantity = clampQuantity(value, MAX_QUANTITY);
        // Al salir del campo, una cantidad vacía o no válida vuelve a 1.
        return { ...part, quantity: onBlur && parseQuantity(quantity) === null ? "1" : quantity };
      }),
    );
  const remove = (key: number) => setParts((current) => current.filter((part) => part.key !== key));

  // Una cantidad no válida se envía como 0 para que el servidor la rechace.
  const payload = JSON.stringify(
    parts.map((part) => ({
      itemId: part.itemId,
      description: part.description,
      quantity: parseQuantity(part.quantity) ?? 0,
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-zinc-700">Refacciones por conseguir</p>
      <div className={`grid gap-3 ${hasInventory ? "sm:grid-cols-2" : ""}`}>
        {hasInventory && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-item`} className="text-xs text-zinc-500">
              Del inventario
            </label>
            <AsyncSelect
              id={`${id}-item`}
              value={null}
              onChange={choose}
              loadOptions={loadOptions}
              placeholder="Busca por nombre o código de barras"
              invalid={Boolean(error)}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-text`} className="text-xs text-zinc-500">
            {hasInventory ? "Si no está en el inventario" : "Refacción"}
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-text`}
              type="text"
              autoComplete="off"
              maxLength={150}
              placeholder="Pantalla, batería, centro de carga…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter agrega la refacción en lugar de enviar el formulario.
                if (event.key === "Enter") {
                  event.preventDefault();
                  addText();
                }
              }}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button type="button" onClick={addText} disabled={!text.trim()} className={ghostButtonClass}>
              Agregar
            </button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-zinc-500">Sin precio, por si cambia al conseguirlas.</p>
      )}
      {notice && <p className="text-xs text-amber-700">{notice}</p>}

      {parts.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {parts.map((part) => (
            <li key={part.key} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="break-words text-zinc-900">{part.description}</p>
                {part.itemId && (
                  <p className="text-xs text-zinc-500">
                    Del inventario
                    {part.stock !== null && (part.stock === 0 ? " · Agotado" : ` · ${part.stock} en existencia`)}
                  </p>
                )}
              </div>
              <label className="sr-only" htmlFor={`${id}-qty-${part.key}`}>
                Cantidad de {part.description}
              </label>
              <IntegerInput
                id={`${id}-qty-${part.key}`}
                placeholder="1"
                max={MAX_QUANTITY}
                value={part.quantity}
                onChange={(value) => setQuantity(part.key, value)}
                onBlur={(event) => setQuantity(part.key, event.currentTarget.value, true)}
                className="w-20"
              />
              <button type="button" onClick={() => remove(part.key)} className={ghostButtonClass}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <input type="hidden" name="partsToGet" value={parts.length > 0 ? payload : ""} />
    </div>
  );
}
