import type { Metadata } from "next";
import { toString as qrToString } from "qrcode";
import { TicketSettingsForm, type TicketPreviewSamples } from "@/components/settings/ticket-settings-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { dateTimeFormatter } from "@/lib/cash/format";
import { addDays, formatDay, todayInMexico } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { hasModule } from "@/lib/modules";
import { publicBaseUrl } from "@/lib/public-url";
import { updateTicketSettingsAction } from "@/lib/settings/actions";
import { getTicketSettings } from "@/lib/settings/core";

export const metadata: Metadata = {
  title: "Ticket — Configuración — CellFix",
};

const dayDateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

// Datos de ejemplo para la vista previa, con fechas de hoy.
function buildSamples(): TicketPreviewSamples {
  const now = new Date();
  const base = {
    folio: 1024,
    dateLabel: dateTimeFormatter.format(now),
    customerName: "María López",
    customerPhone: "5512345678",
    device: "Teléfono Samsung Galaxy A54",
    serialNumber: "356789104512345",
    color: "Negro",
    accessories: "Funda",
    deviceCondition: "Rayón en la esquina superior",
    reportedIssue: "La pantalla no enciende después de una caída.",
    diagnosisFee: null,
    diagnosisNote: null,
    subtotal: formatMoney("1206.90"),
    taxTotal: formatMoney("193.10"),
    total: formatMoney("1400.00"),
  };

  return {
    intake: {
      ...base,
      delivered: false,
      intakeLabel: "Refacción por conseguir",
      parts: [],
      partsTotal: null,
      partsToGet: [
        { id: "q1", description: "Pantalla Galaxy A54 original", quantity: 1 },
        { id: "q2", description: "Mica de cristal templado", quantity: 1 },
      ],
      estimatedCost: formatMoney("1400.00"),
      promisedOn: formatDay(addDays(new Date(`${todayInMexico()}T00:00:00Z`), 3).toISOString().slice(0, 10)),
      lines: [],
      payments: [{ id: "p1", label: "Anticipo efectivo", amount: formatMoney("500.00") }],
      // Sin renglones en la orden aún no hay saldo, igual que en el comprobante real.
      balance: null,
      outcomeLabel: null,
      warrantyText: null,
    },
    delivered: {
      ...base,
      delivered: true,
      intakeLabel: "Refacción por conseguir",
      parts: [],
      partsTotal: null,
      partsToGet: [],
      estimatedCost: null,
      promisedOn: null,
      lines: [
        { id: "l1", description: "Pantalla Galaxy A54 (con instalación)", detail: `1 x ${formatMoney("1400.00")}`, total: formatMoney("1400.00") },
      ],
      payments: [
        { id: "p1", label: "Anticipo efectivo", amount: formatMoney("500.00") },
        { id: "p2", label: "Pago al entregar tarjeta de débito", amount: formatMoney("900.00") },
      ],
      balance: null,
      outcomeLabel: "Reparado",
      warrantyText: `Garantía: 90 días, hasta el ${dayDateFormatter.format(addDays(now, 90))}.`,
    },
    sale: {
      folio: 587,
      dateLabel: dateTimeFormatter.format(now),
      items: [
        { name: "Mica de cristal templado", detail: `1 x ${formatMoney("150.00")}`, total: formatMoney("150.00") },
        { name: "Cable USB-C 1 m", detail: `2 x ${formatMoney("120.00")}`, total: formatMoney("240.00") },
      ],
      subtotal: formatMoney("336.21"),
      taxTotal: formatMoney("53.79"),
      total: formatMoney("390.00"),
    },
  };
}

export default async function TicketSettingsPage() {
  const session = await requireTenantPermission("settings.manage");
  const settings = await getTicketSettings(session.tenant.id);
  const trackingEnabled = hasModule(session.modules, "tracking");

  // QR de muestra con la forma del enlace real; no lleva a ninguna orden.
  const sampleQr = trackingEnabled
    ? await qrToString(`${await publicBaseUrl()}/s/${session.tenant.slug}/${"0".repeat(64)}`, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 0,
      })
    : null;

  return (
    <TicketSettingsForm
      action={updateTicketSettingsAction}
      settings={settings}
      tenantName={session.tenant.name}
      trackingEnabled={trackingEnabled}
      sampleQr={sampleQr}
      samples={buildSamples()}
    />
  );
}
