"use client";

import { useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { DialogButton, useDialogAction } from "@/components/ui/dialog-button";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { DecimalInput, IntegerInput } from "@/components/ui/money-input";
import {
  MAX_QUANTITY,
  PriceTaxFields,
  clampQuantity,
  parseQuantity,
  useRepairItemSearch,
} from "@/components/orders/part-fields";
import { AsyncSelect, Select, type SelectOption } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import {
  ORDER_OUTCOMES,
  ORDER_OUTCOME_LABELS,
  ORDER_STATUS_LABELS,
  WORK_TRANSITIONS,
  type OrderStatus,
} from "@/lib/orders/labels";

// Ventanas del trabajo del técnico: diagnóstico, cambio de estado, refacciones y mano de obra.

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Actions({
  pending,
  label,
  onCancel,
  disabled = false,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} className={secondaryButtonClass}>
        Cancelar
      </button>
      <button type="submit" disabled={pending || disabled} className={primaryButtonClass}>
        {pending ? "Guardando…" : label}
      </button>
    </div>
  );
}

function DiagnosisForm({
  action,
  defaults,
  showEstimate,
  customerVisible,
  onDone,
}: {
  action: Action;
  defaults: { diagnosis: string; estimatedCost: string; promisedOn: string };
  showEstimate: boolean;
  customerVisible: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const id = useId();
  const value = (key: keyof typeof defaults) => state?.fields?.[key] ?? defaults[key];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Diagnóstico" name={`${id}-diagnosis`} hint={`Qué tiene el equipo y qué se propone hacer.${customerVisible ? " El cliente lo verá en el seguimiento." : ""}`}>
        <textarea
          id={`${id}-diagnosis`}
          name="diagnosis"
          rows={4}
          maxLength={2000}
          defaultValue={value("diagnosis")}
          className={`${inputClass} resize-y`}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {showEstimate && (
          <Field label="Costo estimado" name={`${id}-estimate`} error={state?.errors?.estimatedCost}>
            <DecimalInput
              id={`${id}-estimate`}
              name="estimatedCost"
              placeholder="0.00"
              defaultValue={value("estimatedCost")}
            />
          </Field>
        )}
        <Field label="Fecha prometida" name={`${id}-promised`} error={state?.errors?.promisedOn}>
          <input id={`${id}-promised`} name="promisedOn" type="date" defaultValue={value("promisedOn")} className={inputClass} />
        </Field>
      </div>
      <FormMessage state={state} />
      <Actions pending={pending} label="Guardar diagnóstico" onCancel={onDone} />
    </form>
  );
}

export function DiagnosisDialog({
  action,
  defaults,
  showEstimate,
  customerVisible,
}: {
  action: Action;
  defaults: { diagnosis: string; estimatedCost: string; promisedOn: string };
  // Los técnicos no ven precios: solo capturan el diagnóstico y la fecha.
  showEstimate: boolean;
  // El diagnóstico se muestra en la página de seguimiento del cliente.
  customerVisible: boolean;
}) {
  const title = showEstimate ? "Diagnóstico y presupuesto" : "Diagnóstico";
  return (
    <DialogButton label={title} className={secondaryButtonClass} title={title}>
      {(close) => <DiagnosisForm action={action} defaults={defaults} showEstimate={showEstimate} customerVisible={customerVisible} onDone={close} />}
    </DialogButton>
  );
}

function StatusForm({ action, current, onDone }: { action: Action; current: OrderStatus; onDone: () => void }) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const options = WORK_TRANSITIONS[current].map((status) => ({ value: status, label: ORDER_STATUS_LABELS[status] }));
  const [status, setStatus] = useState<string>(state?.fields?.status || options[0]?.value || "");
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Nuevo estado" name={`${id}-status`} error={state?.errors?.status}>
        <Select id={`${id}-status`} name="status" options={options} defaultValue={status} onChange={(value) => setStatus(value ?? "")} />
      </Field>

      {status === "ready" && (
        <fieldset>
          <legend className="text-sm font-medium text-zinc-700">Resultado</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ORDER_OUTCOMES.map((outcome) => (
              <label
                key={outcome}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm has-checked:border-zinc-900 has-checked:ring-1 has-checked:ring-zinc-900"
              >
                <input
                  type="radio"
                  name="outcome"
                  value={outcome}
                  defaultChecked={(state?.fields?.outcome || "repaired") === outcome}
                  className="accent-zinc-900"
                />
                {ORDER_OUTCOME_LABELS[outcome]}
              </label>
            ))}
          </div>
          {state?.errors?.outcome && <p className="mt-1.5 text-xs text-red-600">{state.errors.outcome}</p>}
        </fieldset>
      )}

      <Field label="Nota" name={`${id}-note`} hint="Opcional: queda en el historial de la orden.">
        <input
          id={`${id}-note`}
          name="note"
          type="text"
          autoComplete="off"
          maxLength={500}
          defaultValue={state?.fields?.note}
          className={inputClass}
        />
      </Field>

      <FormMessage state={state} />
      <Actions pending={pending} label="Cambiar estado" onCancel={onDone} />
    </form>
  );
}

export function StatusDialog({ action, current }: { action: Action; current: OrderStatus }) {
  if (WORK_TRANSITIONS[current].length === 0) return null;
  return (
    <DialogButton
      label="Cambiar estado"
      className={primaryButtonClass}
      title="Cambiar estado"
      description={`Estado actual: ${ORDER_STATUS_LABELS[current]}`}
    >
      {(close) => <StatusForm action={action} current={current} onDone={close} />}
    </DialogButton>
  );
}

function PartForm({ action, onDone }: { action: Action; onDone: () => void }) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const [part, setPart] = useState<SelectOption | null>(null);
  // Existencias de la refacción elegida; null si no lleva control de existencias.
  const [stock, setStock] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(state?.fields?.quantity ?? "1");
  // El precio (pieza + mano de obra) solo llega a quien puede ver precios.
  const { loadOptions: loadParts, find } = useRepairItemSearch();
  const id = useId();
  const max = Math.min(stock ?? MAX_QUANTITY, MAX_QUANTITY);

  // Al cambiar de refacción la cantidad se ajusta a lo que hay en existencia.
  const choosePart = (option: SelectOption | null) => {
    const item = option ? find(option.value) : null;
    const nextStock = item?.trackStock ? item.stock : null;
    setPart(option);
    setStock(nextStock);
    setQuantity((current) => clampQuantity(current, Math.min(nextStock ?? MAX_QUANTITY, MAX_QUANTITY)));
  };

  const stockHint = stock === null ? null : stock === 0 ? "Sin existencias." : `Hay ${stock} en existencia.`;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="itemId" value={part?.value ?? ""} />
      <Field label="Refacción" name={`${id}-item`} error={state?.errors?.itemId}>
        <AsyncSelect id={`${id}-item`} value={part} onChange={choosePart} loadOptions={loadParts} placeholder="Nombre o código de barras" />
      </Field>
      <Field label="Cantidad" name={`${id}-quantity`} error={state?.errors?.quantity}>
        <IntegerInput
          id={`${id}-quantity`}
          name="quantity"
          max={Math.max(max, 1)}
          value={quantity}
          onChange={(value) => setQuantity(clampQuantity(value, max))}
          aria-describedby={`${id}-stock`}
          className="sm:w-32"
        />
        <p id={`${id}-stock`} aria-live="polite" className="text-xs text-zinc-500">
          {stockHint}
        </p>
      </Field>
      <p className="text-xs text-zinc-500">Se descuenta del inventario al agregarla; si la quitas, regresa.</p>
      <FormMessage state={state} />
      <Actions pending={pending} label="Agregar refacción" onCancel={onDone} disabled={stock === 0} />
    </form>
  );
}

export function PartDialog({ action }: { action: Action }) {
  return (
    <DialogButton label="Agregar refacción" className={secondaryButtonClass} title="Agregar refacción">
      {(close) => <PartForm action={action} onDone={close} />}
    </DialogButton>
  );
}

function LaborForm({ action, onDone }: { action: Action; onDone: () => void }) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Trabajo" name={`${id}-description`} error={state?.errors?.description}>
        <input
          id={`${id}-description`}
          name="description"
          type="text"
          autoComplete="off"
          maxLength={150}
          placeholder="Cambio de pantalla, limpieza, diagnóstico…"
          defaultValue={state?.fields?.description}
          className={inputClass}
        />
      </Field>
      <PriceTaxFields id={id} state={state} priceLabel="Precio" />
      <FormMessage state={state} />
      <Actions pending={pending} label="Agregar mano de obra" onCancel={onDone} />
    </form>
  );
}

function FreePartForm({ action, showPrices, onDone }: { action: Action; showPrices: boolean; onDone: () => void }) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const [quantity, setQuantity] = useState(state?.fields?.quantity ?? "1");
  const id = useId();
  const pieces = parseQuantity(quantity);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Refacción" name={`${id}-description`} error={state?.errors?.description}>
        <input
          id={`${id}-description`}
          name="description"
          type="text"
          autoComplete="off"
          maxLength={150}
          placeholder="Pantalla, batería, centro de carga…"
          defaultValue={state?.fields?.description}
          className={inputClass}
        />
      </Field>
      <Field label="Cantidad" name={`${id}-quantity`} error={state?.errors?.quantity}>
        <IntegerInput
          id={`${id}-quantity`}
          name="quantity"
          max={MAX_QUANTITY}
          value={quantity}
          onChange={setQuantity}
          className="sm:w-32"
        />
      </Field>
      {showPrices && <PriceTaxFields id={id} state={state} priceLabel="Precio por pieza" quantity={pieces} />}
      <FormMessage state={state} />
      <Actions pending={pending} label="Agregar refacción" onCancel={onDone} />
    </form>
  );
}

// Para talleres sin el módulo de Inventario: la refacción se describe a mano.
export function FreePartDialog({ action, showPrices }: { action: Action; showPrices: boolean }) {
  return (
    <DialogButton label="Agregar refacción" className={secondaryButtonClass} title="Agregar refacción">
      {(close) => <FreePartForm action={action} showPrices={showPrices} onDone={close} />}
    </DialogButton>
  );
}

function ReleaseForm({ action, onDone }: { action: Action; onDone: () => void }) {
  const [state, formAction, pending] = useDialogAction(action, onDone);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field
        label="¿Por qué la devuelves?"
        name={`${id}-reason`}
        error={state?.errors?.reason}
        hint="Lo verá el técnico que la tome después."
      >
        <textarea
          id={`${id}-reason`}
          name="reason"
          rows={3}
          maxLength={400}
          placeholder="No tengo la herramienta, requiere microsoldadura…"
          defaultValue={state?.fields?.reason}
          className={`${inputClass} resize-y`}
        />
      </Field>
      <p className="text-xs text-zinc-500">Las refacciones y la mano de obra ya agregadas se quedan en la orden.</p>
      <FormMessage state={state} />
      <Actions pending={pending} label="Devolver a la cola" onCancel={onDone} />
    </form>
  );
}

export function ReleaseDialog({ action }: { action: Action }) {
  return (
    <DialogButton
      label="Devolver a la cola"
      className={secondaryButtonClass}
      title="Devolver a la cola"
      description="La orden queda libre para que la tome otro técnico."
    >
      {(close) => <ReleaseForm action={action} onDone={close} />}
    </DialogButton>
  );
}

export function LaborDialog({ action }: { action: Action }) {
  return (
    <DialogButton label="Agregar mano de obra" className={secondaryButtonClass} title="Agregar mano de obra">
      {(close) => <LaborForm action={action} onDone={close} />}
    </DialogButton>
  );
}
