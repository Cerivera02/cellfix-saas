import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/cash/print-button";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents, toCents } from "@/lib/cash/money";
import { addDays, formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { getOrder } from "@/lib/orders/core";
import {
  ORDER_ACCESS_PERMISSIONS,
  ORDER_OUTCOME_LABELS,
  ORDER_PAYMENT_KIND_LABELS,
  canSeeOrderPrices,
  describeDevice,
} from "@/lib/orders/labels";

export const metadata: Metadata = {
  title: "Comprobante — CellFix",
};

const dayDateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-[13px] font-bold" : ""}`}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function Divider() {
  return <hr className="my-2 border-t border-dashed border-zinc-400" />;
}

// Comprobante de 80 mm: de recepción mientras la orden está abierta y ticket al entregar.
// No imprime la contraseña del equipo.
export default async function OrderReceiptPage(props: PageProps<"/dashboard/orders/[id]/receipt">) {
  const session = await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  const { id } = await props.params;

  // El comprobante lleva importes: no es para quien no ve precios (técnicos).
  if (!canSeeOrderPrices(session.permissions)) redirect(`/dashboard/orders/${id}`);

  const order = await getOrder(session.tenant.id, id);
  if (!order) notFound();

  const delivered = order.status === "delivered";
  const balance = toCents(order.total) - toCents(order.paidTotal);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/orders/${order.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Orden #{order.folio}
        </Link>
        <PrintButton label={delivered ? "Imprimir ticket" : "Imprimir comprobante"} />
      </div>

      <article className="mx-auto w-full max-w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-sm ring-1 ring-zinc-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="text-center">
          <p className="text-[14px] font-bold">{session.tenant.name}</p>
          <p>{delivered ? "Entrega de equipo" : "Orden de servicio"}</p>
          <p className="text-[16px] font-bold">#{order.folio}</p>
          <p>{dateTimeFormatter.format(delivered && order.deliveredAt ? order.deliveredAt : order.createdAt)}</p>
        </header>

        <Divider />

        <p>Cliente: {order.customerName}</p>
        {order.customerPhone && <p>Tel: {order.customerPhone}</p>}

        <Divider />

        <p className="font-bold">{describeDevice(order)}</p>
        {order.serialNumber && <p>IMEI/Serie: {order.serialNumber}</p>}
        {order.color && <p>Color: {order.color}</p>}
        <p>Accesorios: {order.accessories || "Ninguno"}</p>
        {order.deviceCondition && <p>Estado: {order.deviceCondition}</p>}
        <p className="mt-1">Falla: {order.reportedIssue}</p>

        {!delivered && (
          <>
            {(order.estimatedCost !== null || order.promisedOn) && <Divider />}
            {order.estimatedCost !== null && <Row label="Costo estimado" value={formatMoney(order.estimatedCost)} />}
            {order.promisedOn && <Row label="Fecha prometida" value={formatDay(order.promisedOn)} />}
          </>
        )}

        {delivered && order.lines.length > 0 && (
          <>
            <Divider />
            <ul className="space-y-1.5">
              {order.lines.map((line) => (
                <li key={line.id}>
                  <p>
                    {line.description}
                    {toCents(line.laborPrice) > 0 && " (con instalación)"}
                  </p>
                  <div className="flex justify-between gap-3">
                    <span>
                      {line.quantity} x {formatMoney(fromCents(toCents(line.unitPrice) + toCents(line.laborPrice)))}
                      {!line.taxIncluded && Number(line.taxRate) > 0 && " + IVA"}
                    </span>
                    <span className="tabular-nums">{formatMoney(line.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Divider />
            <Row label="Subtotal" value={formatMoney(order.subtotal)} />
            <Row label="IVA" value={formatMoney(order.taxTotal)} />
            <Row label="TOTAL" value={formatMoney(order.total)} strong />
          </>
        )}

        {order.payments.length > 0 && (
          <>
            <Divider />
            {order.payments.map((payment) => (
              <Row
                key={payment.id}
                label={`${ORDER_PAYMENT_KIND_LABELS[payment.kind]} ${PAYMENT_METHOD_LABELS[payment.method].toLowerCase()}`}
                value={`${payment.kind === "refund" ? "-" : ""}${formatMoney(payment.amount)}`}
              />
            ))}
            {!delivered && balance > 0 && <Row label="Saldo" value={formatMoney(fromCents(balance))} strong />}
          </>
        )}

        <Divider />
        {delivered ? (
          <>
            {order.outcome && <p className="text-center">{ORDER_OUTCOME_LABELS[order.outcome]}</p>}
            {order.outcome === "repaired" && order.warrantyDays > 0 && order.deliveredAt && (
              <p className="text-center">
                Garantía de {order.warrantyDays} días, hasta el{" "}
                {dayDateFormatter.format(addDays(order.deliveredAt, order.warrantyDays))}.
              </p>
            )}
            <p className="mt-1 text-center">¡Gracias por su preferencia!</p>
          </>
        ) : (
          <>
            <p className="text-center">Presente este comprobante para recoger su equipo.</p>
            {order.warrantyDays > 0 && (
              <p className="text-center">Garantía de {order.warrantyDays} días sobre la reparación realizada.</p>
            )}
            <div className="mt-8 border-t border-black pt-1 text-center">Firma del cliente</div>
          </>
        )}
      </article>
    </>
  );
}
