import type { Metadata } from "next";
import Link from "next/link";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { getOpenShift, listBankAccounts } from "@/lib/cash/core";
import { todayInMexico } from "@/lib/dates";
import { listSuppliers } from "@/lib/inventory/core";
import { getOrder } from "@/lib/orders/core";
import { describeDevice, isActiveStatus } from "@/lib/orders/labels";

export const metadata: Metadata = {
  title: "Registrar compra — CellFix",
};

export default async function NewPurchasePage(props: PageProps<"/dashboard/purchases/new">) {
  const session = await requireTenantPermission("purchases.manage");
  const canOperateCash = session.permissions.includes("cash.operate");
  const searchParams = await props.searchParams;
  const orderId = typeof searchParams.orden === "string" ? searchParams.orden : "";

  const [suppliers, accounts, shift, order] = await Promise.all([
    listSuppliers(session.tenant.id),
    listBankAccounts(session.tenant.id, { activeOnly: true }),
    canOperateCash ? getOpenShift(session.tenant.id) : null,
    orderId ? getOrder(session.tenant.id, orderId) : null,
  ]);

  const defaultOrder =
    order && isActiveStatus(order.status)
      ? { value: order.id, label: `#${order.folio} · ${describeDevice(order)}`, detail: order.customerName }
      : null;

  return (
    <>
      <Link
        href={defaultOrder ? `/dashboard/orders/${defaultOrder.value}` : "/dashboard/purchases"}
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← {defaultOrder ? `Orden ${defaultOrder.label.split(" · ")[0]}` : "Compras"}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Registrar compra</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {defaultOrder
          ? `Las piezas quedarán ligadas a la orden ${defaultOrder.label}.`
          : "Captura lo que llegó del proveedor: sube existencias y actualiza el costo de cada artículo."}
      </p>

      <div className="mt-6 max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <PurchaseForm
          suppliers={suppliers
            .filter((supplier) => supplier.isActive)
            .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          accounts={accounts.map((account) => ({
            id: account.id,
            bankName: account.bankName,
            holderName: account.holderName,
            clabe: account.clabe,
            alias: account.alias,
          }))}
          drawerAvailable={Boolean(shift)}
          today={todayInMexico()}
          defaultOrder={defaultOrder}
        />
      </div>
    </>
  );
}
