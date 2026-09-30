import { TicketHeader } from "@/components/tickets/ticket-header";
import { TicketDivider, TicketPaper, TicketRow } from "@/components/tickets/ticket-paper";
import { DEFAULT_ORDER_FOOTER, type TicketSettings } from "@/lib/settings/ticket";

// Comprobante de una orden: de recepción mientras está abierta y ticket al entregar.
// Recibe los textos ya formateados para usarse igual en el comprobante real y en la vista previa.
// Nunca lleva la contraseña del equipo.

export type OrderTicketData = {
  delivered: boolean;
  folio: number;
  dateLabel: string;
  customerName: string;
  customerPhone: string;
  device: string;
  serialNumber: string;
  color: string;
  accessories: string;
  deviceCondition: string;
  reportedIssue: string;
  // Tipo de ingreso ("Diagnóstico", "Refacción en existencia"…); null en órdenes anteriores.
  intakeLabel: string | null;
  // Costo del diagnóstico cobrado al recibir, ya formateado; null si no se cobró.
  diagnosisFee: string | null;
  // Aviso sobre el descuento del diagnóstico ("Se descuenta del total si…" o "descontado de la reparación").
  diagnosisNote: string | null;
  estimatedCost: string | null;
  promisedOn: string | null;
  // Recepción: refacciones que se cambiarán (en existencia) y su total, ya formateado; null si no hay.
  parts: { id: string; description: string; detail: string; total: string }[];
  partsTotal: string | null;
  // Refacciones por conseguir anotadas al recibir, sin precio; vacío si no aplica.
  partsToGet: { id: string; description: string; quantity: number }[];
  lines: { id: string; description: string; detail: string; total: string }[];
  subtotal: string;
  taxTotal: string;
  total: string;
  payments: { id: string; label: string; amount: string }[];
  balance: string | null;
  outcomeLabel: string | null;
  // Solo al entregar un equipo reparado: "Garantía: 90 días, hasta el …". La garantía se elige al
  // entregar, así que el comprobante de recepción no la lleva.
  warrantyText: string | null;
};

export type OrderTicketSettings = Pick<
  TicketSettings,
  "business" | "orderTerms" | "orderFooter" | "paperWidth" | "showCustomerPhone"
>;

export function OrderTicket({
  order,
  settings,
  qrSvg,
}: {
  order: OrderTicketData;
  settings: OrderTicketSettings;
  // Código QR del seguimiento (SVG); null si no se imprime.
  qrSvg?: string | null;
}) {
  const { delivered } = order;
  // Sin pie configurado, el ticket de entrega agradece y el de recepción no lleva pie.
  const footer = settings.orderFooter || (delivered ? DEFAULT_ORDER_FOOTER : "");

  return (
    <TicketPaper width={settings.paperWidth}>
      <TicketHeader business={settings.business}>
        <p>{delivered ? "Entrega de equipo" : "Orden de servicio"}</p>
        <p className="text-[1.33em] font-bold">#{order.folio}</p>
        <p>{order.dateLabel}</p>
      </TicketHeader>

      <TicketDivider />

      <p>Cliente: {order.customerName}</p>
      {settings.showCustomerPhone && order.customerPhone && <p>Tel: {order.customerPhone}</p>}

      <TicketDivider />

      <p className="font-bold">{order.device}</p>
      {order.serialNumber && <p>IMEI/Serie: {order.serialNumber}</p>}
      {order.color && <p>Color: {order.color}</p>}
      <p>Accesorios: {order.accessories || "Ninguno"}</p>
      {order.deviceCondition && <p>Estado: {order.deviceCondition}</p>}
      <p className="mt-1">Falla: {order.reportedIssue}</p>
      {!delivered && order.intakeLabel && <p>Ingreso: {order.intakeLabel}</p>}

      {!delivered && order.parts.length > 0 && (
        <>
          <TicketDivider />
          <p className="font-bold">Refacción</p>
          <ul className="space-y-1.5">
            {order.parts.map((part) => (
              <li key={part.id}>
                <p>{part.description}</p>
                <div className="flex justify-between gap-3">
                  <span>{part.detail}</span>
                  <span className="tabular-nums">{part.total}</span>
                </div>
              </li>
            ))}
          </ul>
          {order.partsTotal && order.parts.length > 1 && <TicketRow label="Total refacciones" value={order.partsTotal} />}
        </>
      )}

      {!delivered && order.parts.length === 0 && order.partsToGet.length > 0 && (
        <>
          <TicketDivider />
          <p>Refacciones por conseguir:</p>
          <ul>
            {order.partsToGet.map((part) => (
              <li key={part.id} className="flex justify-between gap-3">
                <span>{part.description}</span>
                <span className="tabular-nums">x{part.quantity}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {!delivered && (order.estimatedCost !== null || order.promisedOn || order.diagnosisFee) && (
        <>
          <TicketDivider />
          {order.diagnosisFee && <TicketRow label="Diagnóstico" value={order.diagnosisFee} />}
          {order.diagnosisFee && order.diagnosisNote && <p>{order.diagnosisNote}</p>}
          {order.estimatedCost !== null && <TicketRow label="Costo estimado" value={order.estimatedCost} />}
          {order.promisedOn && <TicketRow label="Fecha prometida" value={order.promisedOn} />}
        </>
      )}

      {delivered && order.lines.length > 0 && (
        <>
          <TicketDivider />
          <ul className="space-y-1.5">
            {order.lines.map((line) => (
              <li key={line.id}>
                <p>{line.description}</p>
                <div className="flex justify-between gap-3">
                  <span>{line.detail}</span>
                  <span className="tabular-nums">{line.total}</span>
                </div>
              </li>
            ))}
          </ul>
          <TicketDivider />
          <TicketRow label="Subtotal" value={order.subtotal} />
          <TicketRow label="IVA" value={order.taxTotal} />
          <TicketRow label="TOTAL" value={order.total} strong />
          {order.diagnosisNote && <p>{order.diagnosisNote}</p>}
        </>
      )}

      {order.payments.length > 0 && (
        <>
          <TicketDivider />
          {order.payments.map((payment) => (
            <TicketRow key={payment.id} label={payment.label} value={payment.amount} />
          ))}
          {!delivered && order.balance && <TicketRow label="Saldo" value={order.balance} strong />}
        </>
      )}

      <TicketDivider />
      {delivered ? (
        <>
          {order.outcomeLabel && <p className="text-center">{order.outcomeLabel}</p>}
          {order.warrantyText && <p className="text-center">{order.warrantyText}</p>}
        </>
      ) : (
        <>
          {settings.orderTerms && (
            <>
              <p className="font-bold">Condiciones de servicio</p>
              <p className="whitespace-pre-line">{settings.orderTerms}</p>
              <TicketDivider />
            </>
          )}
          <p className="text-center">Presente este comprobante para recoger su equipo.</p>
          <div className="mt-8 border-t border-black pt-1 text-center">Firma del cliente</div>
        </>
      )}

      {qrSvg && (
        <div className="mt-3 flex flex-col items-center gap-1 text-center">
          <div
            className="size-[26mm] [&>svg]:size-full"
            // SVG generado en el servidor con la librería qrcode a partir de nuestra propia URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p>Escanea para ver el avance de tu equipo</p>
        </div>
      )}

      {footer && <p className="mt-2 text-center whitespace-pre-line">{footer}</p>}
    </TicketPaper>
  );
}
