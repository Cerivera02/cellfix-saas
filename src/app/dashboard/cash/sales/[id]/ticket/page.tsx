import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/cash/print-button";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { getSale } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { toCents } from "@/lib/cash/money";
import { formatMoney } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Ticket — CellFix",
};

function TicketRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-[13px] font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Divider() {
  return <hr className="my-2 border-t border-dashed border-zinc-400" />;
}

// Ticket de 80 mm. Al imprimir se ocultan el menú y los botones (clases print:*).
export default async function TicketPage(props: PageProps<"/dashboard/cash/sales/[id]/ticket">) {
  const session = await requireAnyTenantPermission(["sales.create", "cash.view"]);
  const { id } = await props.params;

  const sale = await getSale(session.tenant.id, id);
  if (!sale) notFound();

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/cash/sales/${sale.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Venta #{sale.folio}
        </Link>
        <PrintButton label="Imprimir ticket" />
      </div>

      <article className="mx-auto w-full max-w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-sm ring-1 ring-zinc-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="text-center">
          <p className="text-[14px] font-bold">{session.tenant.name}</p>
          <p>Venta #{sale.folio}</p>
          <p>{dateTimeFormatter.format(sale.createdAt)}</p>
          {sale.userName && <p>Atendió: {sale.userName}</p>}
          {sale.customerName && <p>Cliente: {sale.customerName}</p>}
        </header>

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
        <p className="text-center">¡Gracias por su compra!</p>
      </article>
    </>
  );
}
