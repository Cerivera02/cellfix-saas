"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { OrderTicket, type OrderTicketData } from "@/components/tickets/order-ticket";
import { TicketHeader } from "@/components/tickets/ticket-header";
import { TicketDivider, TicketPaper, TicketRow } from "@/components/tickets/ticket-paper";
import { Field, inputClass, primaryButtonClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";
import {
  DEFAULT_ORDER_FOOTER,
  DEFAULT_SALE_FOOTER,
  PAPER_WIDTHS,
  PAPER_WIDTH_LABELS,
  TICKET_LIMITS,
  isPaperWidth,
  type PaperWidth,
  type TicketSettings,
} from "@/lib/settings/ticket";

export type TicketPreviewSamples = {
  intake: OrderTicketData;
  delivered: OrderTicketData;
  sale: {
    folio: number;
    dateLabel: string;
    items: { name: string; detail: string; total: string }[];
    subtotal: string;
    taxTotal: string;
    total: string;
  };
};

type TextKey = keyof typeof TICKET_LIMITS;

type Values = Record<TextKey, string> & {
  paperWidth: PaperWidth;
  showCustomerPhone: boolean;
  showTrackingQr: boolean;
};

const PREVIEWS = [
  { key: "intake", label: "Recepción" },
  { key: "delivered", label: "Entrega" },
  { key: "sale", label: "Venta" },
] as const;

type PreviewKey = (typeof PREVIEWS)[number]["key"];

const PAPER_OPTIONS = PAPER_WIDTHS.map((width) => ({ value: width, label: PAPER_WIDTH_LABELS[width] }));

export function TicketSettingsForm({
  action,
  settings,
  tenantName,
  trackingEnabled,
  sampleQr,
  samples,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  settings: TicketSettings;
  tenantName: string;
  trackingEnabled: boolean;
  sampleQr: string | null;
  samples: TicketPreviewSamples;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [preview, setPreview] = useState<PreviewKey>("intake");
  // Campos controlados: la vista previa se redibuja al escribir y conservan su valor si hay errores.
  const [values, setValues] = useState<Values>({
    businessName: settings.customBusinessName,
    address: settings.business.address,
    phone: settings.business.phone,
    taxId: settings.business.taxId,
    orderTerms: settings.orderTerms,
    orderFooter: settings.orderFooter,
    saleFooter: settings.saleFooter,
    paperWidth: settings.paperWidth,
    showCustomerPhone: settings.showCustomerPhone,
    showTrackingQr: settings.showTrackingQr,
  });

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const errors = state?.errors;

  const business = {
    name: values.businessName.trim() || tenantName,
    address: values.address.trim(),
    phone: values.phone.trim(),
    taxId: values.taxId.trim().toUpperCase(),
  };
  const previewSettings = {
    business,
    orderTerms: values.orderTerms.trim(),
    orderFooter: values.orderFooter.trim(),
    paperWidth: values.paperWidth,
    showCustomerPhone: values.showCustomerPhone,
  };
  const qr = trackingEnabled && values.showTrackingQr ? sampleQr : null;

  const textInput = (key: TextKey, label: string, options: { hint?: string; placeholder?: string } = {}) => (
    <Field label={label} name={`ticket-${key}`} error={errors?.[key]} hint={options.hint}>
      <input
        id={`ticket-${key}`}
        name={key}
        type="text"
        autoComplete="off"
        maxLength={TICKET_LIMITS[key]}
        placeholder={options.placeholder}
        value={values[key]}
        onChange={(event) => set(key, event.target.value)}
        className={inputClass}
      />
    </Field>
  );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <form action={formAction} className="flex max-w-xl flex-col gap-6" noValidate>
        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Datos del negocio</h2>
          {textInput("businessName", "Nombre comercial", {
            placeholder: tenantName,
            hint: `Si lo dejas vacío se imprime «${tenantName}».`,
          })}
          <Field label="Dirección" name="ticket-address" error={errors?.address}>
            <textarea
              id="ticket-address"
              name="address"
              rows={2}
              maxLength={TICKET_LIMITS.address}
              placeholder="Ej. Av. Juárez 123, Col. Centro, CDMX"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {textInput("phone", "Teléfono", { placeholder: "Ej. 55 1234 5678" })}
            {textInput("taxId", "RFC", { hint: "Opcional.", placeholder: "Ej. LOGM850101AB1" })}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Textos del ticket</h2>
          <Field
            label="Condiciones de servicio"
            name="ticket-orderTerms"
            error={errors?.orderTerms}
            hint="Se imprimen en el comprobante de recepción, antes de la firma del cliente."
          >
            <textarea
              id="ticket-orderTerms"
              name="orderTerms"
              rows={5}
              maxLength={TICKET_LIMITS.orderTerms}
              placeholder="Ej. Después de 30 días sin recoger el equipo, el taller no se hace responsable."
              value={values.orderTerms}
              onChange={(event) => set("orderTerms", event.target.value)}
              className={inputClass}
            />
          </Field>
          {textInput("orderFooter", "Pie del comprobante de orden", { placeholder: DEFAULT_ORDER_FOOTER })}
          {textInput("saleFooter", "Pie del ticket de venta", { placeholder: DEFAULT_SALE_FOOTER })}
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Impresión</h2>
          <Field label="Ancho del papel" name="ticket-paperWidth" error={errors?.paperWidth}>
            <Select
              id="ticket-paperWidth"
              name="paperWidth"
              placeholder="Elige el ancho…"
              options={PAPER_OPTIONS}
              defaultValue={values.paperWidth}
              invalid={Boolean(errors?.paperWidth)}
              onChange={(value) => {
                if (value && isPaperWidth(value)) set("paperWidth", value);
              }}
            />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="showCustomerPhone"
              checked={values.showCustomerPhone}
              onChange={(event) => set("showCustomerPhone", event.target.checked)}
              className="mt-0.5 size-4 accent-zinc-900"
            />
            <span>Imprimir el teléfono del cliente</span>
          </label>
          {trackingEnabled ? (
            <label className="flex items-start gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="showTrackingQr"
                checked={values.showTrackingQr}
                onChange={(event) => set("showTrackingQr", event.target.checked)}
                className="mt-0.5 size-4 accent-zinc-900"
              />
              <span>
                Imprimir el código QR de seguimiento
                <span className="block text-xs text-zinc-500">
                  El cliente lo escanea para ver el avance, las fotos y el saldo de su orden.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-sm text-zinc-500">
              El código QR de seguimiento se imprime cuando el taller tiene activo el módulo «Seguimiento para clientes».
            </p>
          )}
        </section>

        <div className="flex flex-col gap-2">
          <FormMessage state={state} />
          <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:w-[88mm]" aria-label="Vista previa del ticket">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-700">Vista previa</p>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs">
            {PREVIEWS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPreview(option.key)}
                aria-pressed={preview === option.key}
                className={`rounded-md px-2.5 py-1 transition ${
                  preview === option.key ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {preview === "sale" ? (
          <TicketPaper width={values.paperWidth}>
            <TicketHeader business={business}>
              <p>Venta #{samples.sale.folio}</p>
              <p>{samples.sale.dateLabel}</p>
            </TicketHeader>
            <TicketDivider />
            <ul className="space-y-1.5">
              {samples.sale.items.map((item) => (
                <li key={item.name}>
                  <p>{item.name}</p>
                  <div className="flex justify-between gap-3">
                    <span>{item.detail}</span>
                    <span className="tabular-nums">{item.total}</span>
                  </div>
                </li>
              ))}
            </ul>
            <TicketDivider />
            <TicketRow label="Subtotal" value={samples.sale.subtotal} />
            <TicketRow label="IVA" value={samples.sale.taxTotal} />
            <TicketRow label="TOTAL" value={samples.sale.total} strong />
            <TicketDivider />
            <p className="text-center whitespace-pre-line">{values.saleFooter.trim() || DEFAULT_SALE_FOOTER}</p>
          </TicketPaper>
        ) : (
          <OrderTicket order={samples[preview]} settings={previewSettings} qrSvg={qr} />
        )}
      </aside>
    </div>
  );
}
