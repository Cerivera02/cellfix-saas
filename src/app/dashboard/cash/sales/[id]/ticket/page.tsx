import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/cash/print-button";
import { TicketHeader } from "@/components/tickets/ticket-header";
import { TicketDivider as Divider, TicketPaper, TicketRow } from "@/components/tickets/ticket-paper";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { getSale } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { toCents } from "@/lib/cash/money";
import { formatMoney } from "@/lib/inventory/format";
import { getTicketSettings } from "@/lib/settings/core";
import { DEFAULT_SALE_FOOTER } from "@/lib/settings/ticket";

export const metadata: Metadata = {
  title: "Ticket — CellFix",
};

// Ticket en papel térmico (58 u 80 mm) con los datos del negocio de Configuración. Al imprimir se ocultan el menú y los botones (clases print:*).
export default async function TicketPage(props: PageProps<"/dashboard/cash/sales/[id]/ticket">) {
  const session = await requireAnyTenantPermission(["sales.create", "cash.view"]);
  const { id } = await props.params;

  const [sale, settings] = await Promise.all([getSale(session.tenant.id, id), getTicketSettings(session.tenant.id)]);
  if (!sale) notFound();

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/cash/sales/${sale.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Venta #{sale.folio}
        </Link>
        <PrintButton label="Imprimir ticket" />
      </div>

      <TicketPaper width={settings.paperWidth}>
        <TicketHeader business={settings.business}>
          <p>Venta #{sale.folio}</p>
          <p>{dateTimeFormatter.format(sale.createdAt)}</p>
          {sale.userName && <p>Atendió: {sale.userName}</p>}
          {sale.customerName && <p>Cliente: {sale.customerName}</p>}
        </TicketHeader>

        <Divider />

        <ul className="space-y-1.5">
          {sale.items.map((item) => (
            <li key={item.id}>
              <p>{item.itemName}</p>
              <div className="flex justify-between gap-3">
                <span>
                  {item.quantity} x {formatMoney(item.unitPrice)}
                  {!item.taxIncluded && Number(item.taxRate) > 0 && " + IVA"}
                </span>
                <span className="tabular-nums">{formatMoney(item.total)}</span>
              </div>
            </li>
          ))}
        </ul>

        <Divider />

        <TicketRow label="Subtotal" value={formatMoney(sale.subtotal)} />
        <TicketRow label="IVA" value={formatMoney(sale.taxTotal)} />
        <TicketRow label="TOTAL" value={formatMoney(sale.total)} strong />

        <Divider />

        {sale.payments.map((payment) => (
          <TicketRow
            key={payment.id}
            label={payment.method === "transfer" && payment.bankName ? `Transferencia ${payment.bankName}` : PAYMENT_METHOD_LABELS[payment.method]}
            value={formatMoney(payment.amount)}
          />
        ))}
        {sale.cashReceived !== null && (
          <>
            <TicketRow label="Efectivo recibido" value={formatMoney(sale.cashReceived)} />
            <TicketRow label="Cambio" value={formatMoney(sale.changeAmount)} />
          </>
        )}

        {toCents(sale.refundedTotal) > 0 && (
          <>
            <Divider />
            <TicketRow label="Devuelto" value={`-${formatMoney(sale.refundedTotal)}`} />
          </>
        )}

        <Divider />
        <p className="text-center whitespace-pre-line">{settings.saleFooter || DEFAULT_SALE_FOOTER}</p>
      </TicketPaper>
    </>
  );
}
