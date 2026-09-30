"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { CustomerPicker } from "@/components/customers/customer-picker";
import { IntakeFields, type IntakeOptions } from "@/components/orders/intake-fields";
import { UnlockFields } from "@/components/orders/unlock-fields";
import { PhotoEvidence } from "@/components/photos/photo-evidence";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { DecimalInput } from "@/components/ui/money-input";
import { Select, type SelectOption } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import { DEVICE_TYPES } from "@/lib/orders/labels";

export type OrderFormDefaults = {
  customer: SelectOption | null;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber: string;
  color: string;
  unlockType: string;
  unlockCode: string;
  accessories: string;
  deviceCondition: string;
  reportedIssue: string;
  estimatedCost: string;
  promisedOn: string;
};

type TextKey = Exclude<keyof OrderFormDefaults, "customer">;

export function OrderForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
  withPhotos = false,
  intake,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: OrderFormDefaults;
  // Al recibir el equipo: fotos de evidencia desde el celular, que se ligan al registrar la orden.
  withPhotos?: boolean;
  // Al recibir el equipo: tipo de ingreso y anticipo. Al editar una orden no se muestra.
  intake?: IntakeOptions;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [customer, setCustomer] = useState<SelectOption | null>(defaults?.customer ?? null);
  const id = useId();
  const formId = `${id}-form`;
  const value = (key: TextKey) => state?.fields?.[key] ?? defaults?.[key];

  return (
    <div className="flex flex-col gap-8">
      {/* El selector de cliente queda fuera del <form>: su alta rápida tiene su propio formulario. */}
      <section>
        <CustomerPicker id={`${id}-customer`} value={customer} onChange={setCustomer} />
        {state?.errors?.customerId && <p className="mt-1.5 text-xs text-red-600">{state.errors.customerId}</p>}
      </section>

      <form id={formId} action={formAction} className="flex flex-col gap-8" noValidate>
        <input type="hidden" name="customerId" value={customer?.value ?? ""} />

        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-sm font-medium text-zinc-900 sm:col-span-2">Equipo</h2>

          <Field label="Tipo de equipo" name={`${id}-type`} error={state?.errors?.deviceType}>
            <Select
              id={`${id}-type`}
              name="deviceType"
              options={DEVICE_TYPES.map((type) => ({ value: type, label: type }))}
              defaultValue={value("deviceType") || "Teléfono"}
              isSearchable
            />
          </Field>

          <Field label="Marca" name={`${id}-brand`}>
            <input
              id={`${id}-brand`}
              name="brand"
              type="text"
              autoComplete="off"
              maxLength={60}
              placeholder="Samsung, Apple, Motorola…"
              defaultValue={value("brand")}
              className={inputClass}
            />
          </Field>

          <Field label="Modelo" name={`${id}-model`}>
            <input
              id={`${id}-model`}
              name="model"
              type="text"
              autoComplete="off"
              maxLength={80}
              defaultValue={value("model")}
              className={inputClass}
            />
          </Field>

          <Field label="IMEI o número de serie" name={`${id}-serial`}>
            <input
              id={`${id}-serial`}
              name="serialNumber"
              type="text"
              autoComplete="off"
              maxLength={40}
              defaultValue={value("serialNumber")}
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field label="Color" name={`${id}-color`}>
            <input
              id={`${id}-color`}
              name="color"
              type="text"
              autoComplete="off"
              maxLength={40}
              defaultValue={value("color")}
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <UnlockFields
              id={`${id}-unlock`}
              defaultType={value("unlockType")}
              defaultCode={value("unlockCode")}
              error={state?.errors?.unlockCode}
            />
          </div>

          <div className="sm:col-span-2">
            <Field label="Accesorios que deja" name={`${id}-accessories`} hint="Cargador, funda, SIM, memoria…">
              <input
                id={`${id}-accessories`}
                name="accessories"
                type="text"
                autoComplete="off"
                maxLength={300}
                defaultValue={value("accessories")}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Estado físico" name={`${id}-condition`} hint="Rayones, golpes, pantalla estrellada…">
              <textarea
                id={`${id}-condition`}
                name="deviceCondition"
                rows={2}
                maxLength={500}
                defaultValue={value("deviceCondition")}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>

          {withPhotos && (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-zinc-700">Evidencia fotográfica</p>
              <p className="mb-2 text-xs text-zinc-500">Fotos del estado en que se recibe el equipo.</p>
              <PhotoEvidence
                orderId={null}
                initialPhotos={[]}
                canUpload
                canDelete
                sessionInputName="photoSessionId"
              />
            </div>
          )}
        </section>

        <section className="grid gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-3">
          <h2 className="text-sm font-medium text-zinc-900 sm:col-span-3">Servicio</h2>

          <div className="sm:col-span-3">
            <Field label="Falla que reporta el cliente" name={`${id}-issue`} error={state?.errors?.reportedIssue}>
              <textarea
                id={`${id}-issue`}
                name="reportedIssue"
                rows={3}
                maxLength={1000}
                required
                defaultValue={value("reportedIssue")}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>

          {intake && (
            <div className="sm:col-span-3">
              <IntakeFields options={intake} state={state} />
            </div>
          )}

          <Field label="Costo estimado" name={`${id}-estimate`} error={state?.errors?.estimatedCost} hint="Opcional.">
            <DecimalInput
              id={`${id}-estimate`}
              name="estimatedCost"
              maxLength={20}
              placeholder="0.00"
              defaultValue={value("estimatedCost")}
            />
          </Field>

          <Field label="Fecha prometida" name={`${id}-promised`} error={state?.errors?.promisedOn} hint="Opcional.">
            <input
              id={`${id}-promised`}
              name="promisedOn"
              type="date"
              defaultValue={value("promisedOn")}
              className={inputClass}
            />
          </Field>
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
    </div>
  );
}
