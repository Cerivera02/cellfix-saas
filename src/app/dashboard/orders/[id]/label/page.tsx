import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/cash/print-button";
import { DeviceLabel, shortCustomerName } from "@/components/tickets/device-label";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { getOrder } from "@/lib/orders/core";
import { ORDER_ACCESS_PERMISSIONS, describeDevice } from "@/lib/orders/labels";
import { getTicketSettings } from "@/lib/settings/core";

export const metadata: Metadata = {
  title: "Etiqueta — CellFix",
};

const dayDateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

// Etiqueta del equipo en papel térmico. No lleva importes: la imprime cualquiera con acceso a la orden.
export default async function OrderLabelPage(props: PageProps<"/dashboard/orders/[id]/label">) {
  const session = await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  const { id } = await props.params;

  const [order, settings] = await Promise.all([getOrder(session.tenant.id, id), getTicketSettings(session.tenant.id)]);
  if (!order) notFound();

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/orders/${order.id}`} className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Orden #{order.folio}
        </Link>
        <PrintButton label="Imprimir etiqueta" />
      </div>

      <DeviceLabel
        width={settings.paperWidth}
        label={{
          folio: order.folio,
          device: describeDevice(order),
          color: order.color,
          customerName: shortCustomerName(order.customerName),
          dateLabel: dayDateFormatter.format(order.createdAt),
        }}
      />
    </>
  );
}
