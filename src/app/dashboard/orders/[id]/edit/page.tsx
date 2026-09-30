import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderForm } from "@/components/orders/order-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { updateOrderAction } from "@/lib/orders/actions";
import { getOrder } from "@/lib/orders/core";
import { isActiveStatus } from "@/lib/orders/labels";

export const metadata: Metadata = {
  title: "Editar orden — CellFix",
};

export default async function EditOrderPage(props: PageProps<"/dashboard/orders/[id]/edit">) {
  const session = await requireTenantPermission("orders.intake");
  const { id } = await props.params;

  const order = await getOrder(session.tenant.id, id);
  if (!order) notFound();

  const detailHref = `/dashboard/orders/${order.id}`;
  if (!isActiveStatus(order.status)) redirect(detailHref);

  return (
    <>
      <Link href={detailHref} className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Orden #{order.folio}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Editar orden #{order.folio}</h1>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <OrderForm
          action={updateOrderAction.bind(null, order.id)}
          defaults={{
            customer: {
              value: order.customerId,
              label: order.customerName,
              detail: [order.customerPhone, order.customerEmail].filter(Boolean).join(" · "),
            },
            deviceType: order.deviceType,
            brand: order.brand,
            model: order.model,
            serialNumber: order.serialNumber,
            color: order.color,
            unlockType: order.unlockType,
            unlockCode: order.unlockCode,
            accessories: order.accessories,
            deviceCondition: order.deviceCondition,
            reportedIssue: order.reportedIssue,
            estimatedCost: order.estimatedCost ?? "",
            promisedOn: order.promisedOn ?? "",
          }}
          submitLabel="Guardar cambios"
          cancelHref={detailHref}
        />
      </div>
    </>
  );
}
