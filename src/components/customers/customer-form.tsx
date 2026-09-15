"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { CFDI_USES, TAX_REGIMES, normalizeRfc, personTypeFromRfc } from "@/lib/customers/sat";
import type { FormState } from "@/lib/form-state";

export type CustomerFormDefaults = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  requiresInvoice: boolean;
  taxId: string;
  legalName: string;
  taxRegime: string;
  taxZipCode: string;
  cfdiUse: string;
  billingEmail: string;
};

type TextKey = Exclude<keyof CustomerFormDefaults, "requiresInvoice">;

export function CustomerForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: CustomerFormDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const id = useId();
  const value = (key: TextKey) => state?.fields?.[key] ?? defaults?.[key];

  const submittedInvoice = state?.selections?.requiresInvoice ? state.selections.requiresInvoice.length > 0 : undefined;
  const [requiresInvoice, setRequiresInvoice] = useState(submittedInvoice ?? defaults?.requiresInvoice ?? false);
  const [rfc, setRfc] = useState(value("taxId") ?? "");

  // El tipo de persona (según la longitud del RFC) filtra regímenes y usos del CFDI aplicables.
  const person = personTypeFromRfc(normalizeRfc(rfc));
  const regimeOptions = TAX_REGIMES.filter((regime) => !person || regime.persons.includes(person)).map((regime) => ({
    value: regime.code,
    label: `${regime.code} · ${regime.label}`,
  }));
  const useOptions = CFDI_USES.filter((use) => !person || use.persons.includes(person)).map((use) => ({
    value: use.code,
    label: `${use.code} · ${use.label}`,
  }));

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium text-zinc-900 sm:col-span-2">Datos del cliente</h2>

        <Field label="Nombre" name={`${id}-first`} error={state?.errors?.firstName}>
          <input
            id={`${id}-first`}
            name="firstName"
            type="text"
            autoComplete="off"
            required
            maxLength={80}
            defaultValue={value("firstName")}
            className={inputClass}
          />
        </Field>

        <Field label="Apellidos" name={`${id}-last`}>
          <input
            id={`${id}-last`}
            name="lastName"
            type="text"
            autoComplete="off"
            maxLength={120}
            defaultValue={value("lastName")}
            className={inputClass}
          />
        </Field>

        <Field label="Teléfono" name={`${id}-phone`} error={state?.errors?.phone} hint="Al menos teléfono o correo.">
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="off"
            maxLength={30}
            defaultValue={value("phone")}
            className={inputClass}
          />
        </Field>

        <Field label="Correo" name={`${id}-email`} error={state?.errors?.email}>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="off"
            maxLength={200}
            defaultValue={value("email")}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notas" name={`${id}-notes`} hint="Opcional: equipos que suele traer, preferencias de contacto…">
            <textarea
              id={`${id}-notes`}
              name="notes"
              rows={2}
              maxLength={1000}
              defaultValue={value("notes")}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-zinc-100 pt-6">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3.5 py-3 hover:bg-zinc-50">
          <input
            type="checkbox"
            name="requiresInvoice"
            defaultChecked={requiresInvoice}
            onChange={(event) => setRequiresInvoice(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-zinc-900"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">Requiere factura</span>
            <span className="block text-xs text-zinc-500">
              Guarda los datos fiscales que pide el SAT para emitirle un CFDI 4.0.
            </span>
          </span>
        </label>

        {requiresInvoice && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="RFC"
              name={`${id}-rfc`}
              error={state?.errors?.taxId}
              hint={person === "F" ? "Persona física" : person === "M" ? "Persona moral" : "12 o 13 caracteres."}
            >
              <input
                id={`${id}-rfc`}
                name="taxId"
                type="text"
                autoComplete="off"
                maxLength={20}
                value={rfc}
                onChange={(event) => setRfc(event.target.value.toUpperCase())}
                className={`${inputClass} font-mono uppercase`}
              />
            </Field>

            <Field
              label="Código postal fiscal"
              name={`${id}-zip`}
              error={state?.errors?.taxZipCode}
              hint="El de su domicilio fiscal."
            >
              <input
                id={`${id}-zip`}
                name="taxZipCode"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                defaultValue={value("taxZipCode")}
                className={`${inputClass} tabular-nums`}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Nombre o razón social"
                name={`${id}-legal`}
                error={state?.errors?.legalName}
                hint="Tal como aparece en su Constancia de Situación Fiscal, sin “S.A. de C.V.”."
              >
                <input
                  id={`${id}-legal`}
                  name="legalName"
                  type="text"
                  autoComplete="off"
                  maxLength={250}
                  defaultValue={value("legalName")}
                  className={`${inputClass} uppercase`}
                />
              </Field>
            </div>

            <Field label="Régimen fiscal" name={`${id}-regime`} error={state?.errors?.taxRegime}>
              <Select
                id={`${id}-regime`}
                name="taxRegime"
                options={regimeOptions}
                defaultValue={value("taxRegime")}
                placeholder="Elige el régimen"
                isSearchable
              />
            </Field>

            <Field label="Uso del CFDI" name={`${id}-use`} error={state?.errors?.cfdiUse} hint="Predeterminado para sus facturas.">
              <Select
                id={`${id}-use`}
                name="cfdiUse"
                options={useOptions}
                defaultValue={value("cfdiUse") || "G03"}
                isSearchable
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Correo para facturas"
                name={`${id}-billing`}
                error={state?.errors?.billingEmail}
                hint="Opcional; si se deja vacío se usará el correo del cliente."
              >
                <input
                  id={`${id}-billing`}
                  name="billingEmail"
                  type="email"
                  autoComplete="off"
                  maxLength={200}
                  defaultValue={value("billingEmail")}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
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
