import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { toString as qrToString } from "qrcode";
import { PrintButton } from "@/components/cash/print-button";
import { OrderTicket, type OrderTicketData } from "@/components/tickets/order-ticket";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents, toCents } from "@/lib/cash/money";
import { addDays, formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { hasModule } from "@/lib/modules";
import { getOrder, type OrderDetail } from "@/lib/orders/core";
import {
  ORDER_ACCESS_PERMISSIONS,
  ORDER_OUTCOME_LABELS,
  ORDER_PAYMENT_KIND_LABELS,
  INTAKE_TYPE_LABELS,
  canSeeOrderPrices,
  describeDevice,
} from "@/lib/orders/labels";
import { getRepairSettings, getTicketSettings } from "@/lib/settings/core";
import { buildTrackingUrl, getTrackingToken } from "@/lib/tracking/core";

export const metadata: Metadata = {
  title: "Comprobante — CellFix",
};

const dayDateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function toTicketData(order: OrderDetail, options: { diagnosisCredit: boolean }): OrderTicketData {
  const delivered = order.status === "delivered";
  const balance = toCents(order.total) - toCents(order.paidTotal);

  // Ya descontado: se indica en ambos tickets. Aún cobrado: en recepción se avisa si se descontará
  // (no en órdenes canceladas, donde el diagnóstico se reembolsó).
  let diagnosisNote: string | null = null;
  if (order.diagnosisFee && order.diagnosisDiscount) {
    diagnosisNote =
      order.diagnosisDiscount === order.diagnosisFee
        ? `Diagnóstico de ${formatMoney(order.diagnosisFee)} descontado de la reparación.`
        : `Se descuentan ${formatMoney(order.diagnosisDiscount)} del diagnóstico.`;
  } else if (order.diagnosisFee && !delivered && order.status !== "cancelled" && options.diagnosisCredit) {
    diagnosisNote = "Se descuenta del total si se realiza la reparación.";
  }

  // La garantía se elige al entregar: solo va en el ticket de entrega de un equipo reparado.
  let warrantyText: string | null = null;
  if (delivered && order.outcome === "repaired" && order.warrantyDays > 0 && order.deliveredAt) {
    const until = dayDateFormatter.format(addDays(order.deliveredAt, order.warrantyDays));
    warrantyText = `Garantía: ${order.warrantyName ?? `${order.warrantyDays} días`}, hasta el ${until}.`;
  }

  const toTicketLine = (line: OrderDetail["lines"][number]) => ({
    id: line.id,
    description: `${line.description}${toCents(line.laborPrice) > 0 ? " (con instalación)" : ""}`,
    detail: `${line.quantity} x ${formatMoney(fromCents(toCents(line.unitPrice) + toCents(line.laborPrice)))}${
      !line.taxIncluded && Number(line.taxRate) > 0 ? " + IVA" : ""
    }`,
    total: formatMoney(line.total),
  });
  // Refacciones de la orden: las elegidas al recibir (en existencia) y las que agregue el técnico.
  const parts = order.lines.filter((line) => line.kind === "part");

  return {
    delivered,
    folio: order.folio,
    dateLabel: dateTimeFormatter.format(delivered && order.deliveredAt ? order.deliveredAt : order.createdAt),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    device: describeDevice(order),
    serialNumber: order.serialNumber,
    color: order.color,
    accessories: order.accessories,
    deviceCondition: order.deviceCondition,
    reportedIssue: order.reportedIssue,
    intakeLabel: order.intakeType ? INTAKE_TYPE_LABELS[order.intakeType] : null,
    diagnosisFee: order.diagnosisFee ? formatMoney(order.diagnosisFee) : null,
    diagnosisNote,
    estimatedCost: order.estimatedCost !== null ? formatMoney(order.estimatedCost) : null,
    promisedOn: order.promisedOn ? formatDay(order.promisedOn) : null,
    parts: parts.map(toTicketLine),
    partsTotal: parts.length > 0 ? formatMoney(fromCents(parts.reduce((total, line) => total + toCents(line.total), 0))) : null,
    partsToGet: order.partsToGet.map((part) => ({ id: part.id, description: part.description, quantity: part.quantity })),
    lines: order.lines.map(toTicketLine),
    subtotal: formatMoney(order.subtotal),
    taxTotal: formatMoney(order.taxTotal),
    total: formatMoney(order.total),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      label: `${ORDER_PAYMENT_KIND_LABELS[payment.kind]} ${PAYMENT_METHOD_LABELS[payment.method].toLowerCase()}`,
      amount: `${payment.kind === "refund" ? "-" : ""}${formatMoney(payment.amount)}`,
    })),
    balance: balance > 0 ? formatMoney(fromCents(balance)) : null,
    outcomeLabel: order.outcome ? ORDER_OUTCOME_LABELS[order.outcome] : null,
    warrantyText,
  };
}

// Comprobante de la orden en papel térmico, con los datos del negocio de Configuración.
// No imprime la contraseña del equipo.
export default async function OrderReceiptPage(props: PageProps<"/dashboard/orders/[id]/receipt">) {
  const session = await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  const { id } = await props.params;

  // El comprobante lleva importes: no es para quien no ve precios (técnicos).
  if (!canSeeOrderPrices(session.permissions)) redirect(`/dashboard/orders/${id}`);

  const [order, settings, repairSettings] = await Promise.all([
    getOrder(session.tenant.id, id),
    getTicketSettings(session.tenant.id),
    getRepairSettings(session.tenant.id),
  ]);
  if (!order) notFound();

  // QR a la página pública de seguimiento, si el taller tiene el módulo y lo quiere en el ticket.
  let qrSvg: string | null = null;
  if (hasModule(session.modules, "tracking") && settings.showTrackingQr && order.status !== "cancelled") {
    const token = await getTrackingToken(session.tenant.id, order.id);
    if (token) {
      const url = await buildTrackingUrl(session.tenant.slug, token);
      qrSvg = await qrToString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
    }
  }

  const delivered = order.status === "delivered";

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/orders/${order.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Orden #{order.folio}
        </Link>
        <PrintButton label={delivered ? "Imprimir ticket" : "Imprimir comprobante"} />
      </div>

      <OrderTicket
        order={toTicketData(order, { diagnosisCredit: repairSettings.diagnosisCredit })}
        settings={settings}
        qrSvg={qrSvg}
      />
    </>
  );
}
