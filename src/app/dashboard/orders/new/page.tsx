import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm } from "@/components/orders/order-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { createOrderAction } from "@/lib/orders/actions";

export const metadata: Metadata = {
  title: "Recibir equipo — CellFix",
};

export default async function NewOrderPage() {
  await requireTenantPermission("orders.intake");

  return (
    <>
      <Link href="/dashboard/orders" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Órdenes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Recibir equipo</h1>
      <p className="mt-1 text-sm text-zinc-500">Al guardar se genera el folio y puedes imprimir el comprobante.</p>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <OrderForm action={createOrderAction} submitLabel="Registrar orden" cancelHref="/dashboard/orders" withPhotos />
      </div>
    </>
  );
}
