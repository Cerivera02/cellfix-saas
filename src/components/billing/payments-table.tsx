import { formatCents } from "@/lib/billing/format";
import type { PaymentStatus, SubscriptionPayment } from "@/lib/billing/payments";

const STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: "Pagado", className: "bg-emerald-50 text-emerald-700" },
  open: { label: "Pendiente", className: "bg-amber-50 text-amber-700" },
  draft: { label: "Pendiente", className: "bg-amber-50 text-amber-700" },
  failed: { label: "Falló", className: "bg-red-50 text-red-700" },
  uncollectible: { label: "Falló", className: "bg-red-50 text-red-700" },
  void: { label: "Anulado", className: "bg-zinc-100 text-zinc-600" },
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });
const shortDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "America/Mexico_City",
});

const linkClass = "font-medium text-zinc-900 hover:underline";

// Historial de pagos de la suscripción. Con showStripeIds (panel administrativo) muestra además
// los ids de la factura y del cargo.
export function PaymentsTable({ payments, showStripeIds = false }: { payments: SubscriptionPayment[]; showStripeIds?: boolean }) {
  if (payments.length === 0) {
    return <p className="text-sm text-zinc-500">Aún no hay pagos registrados.</p>;
  }

  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
          <tr>
            <th className="px-6 py-2.5 font-medium">Fecha</th>
            <th className="px-3 py-2.5 font-medium">Periodo</th>
            <th className="px-3 py-2.5 text-right font-medium">Importe</th>
            <th className="px-3 py-2.5 font-medium">Estado</th>
            <th className="px-6 py-2.5 font-medium">Comprobantes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {payments.map((payment) => {
            const status = STATUS[payment.status];
            const amount = payment.status === "paid" ? payment.amountPaid : payment.amountDue;
            return (
              <tr key={payment.id} className="align-top">
                <td className="px-6 py-3 whitespace-nowrap">
                  <p className="text-zinc-900">{dateFormatter.format(payment.paidAt ?? payment.createdAt)}</p>
                  {payment.number && <p className="text-xs text-zinc-500">Factura {payment.number}</p>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-zinc-600">
                  {payment.periodStart && payment.periodEnd
                    ? `${shortDateFormatter.format(payment.periodStart)} – ${shortDateFormatter.format(payment.periodEnd)}`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap text-zinc-900 tabular-nums">
                  {amount !== null && payment.currency ? formatCents(amount, payment.currency) : "—"}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${status.className}`}>
                    {status.label}
                  </span>
                  {payment.failureMessage && payment.status !== "paid" && (
                    <p className="mt-1 max-w-56 text-xs text-red-600">{payment.failureMessage}</p>
                  )}
                </td>
                <td className="px-6 py-3">
                  <p className="flex flex-wrap gap-x-3 gap-y-1">
                    {payment.hostedInvoiceUrl && (
                      <a href={payment.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        Factura
                      </a>
                    )}
                    {payment.receiptUrl && (
                      <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        Recibo
                      </a>
                    )}
                    {payment.invoicePdf && (
                      <a href={payment.invoicePdf} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        PDF
                      </a>
                    )}
                  </p>
                  <div className="mt-1 font-mono text-[0.7rem] leading-relaxed break-all text-zinc-400">
                    {payment.stripePaymentIntentId && <p>{payment.stripePaymentIntentId}</p>}
                    {showStripeIds && (
                      <>
                        <p>{payment.stripeInvoiceId}</p>
                        {payment.stripeChargeId && <p>{payment.stripeChargeId}</p>}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
