import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm } from "@/components/orders/order-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { listBankAccounts } from "@/lib/cash/core";
import { hasModule } from "@/lib/modules";
import { createOrderAction } from "@/lib/orders/actions";
import { canSeeOrderPrices } from "@/lib/orders/labels";
import { getRepairSettings } from "@/lib/settings/core";

export const metadata: Metadata = {
  title: "Recibir equipo — CellFix",
};

export default async function NewOrderPage() {
  const session = await requireTenantPermission("orders.intake");
  // El anticipo al recibir solo lo registra quien puede cobrar.
  const canCollect = session.permissions.includes("payments.collect");
  const [repairSettings, accounts] = await Promise.all([
    getRepairSettings(session.tenant.id),
    canCollect ? listBankAccounts(session.tenant.id, { activeOnly: true }) : [],
  ]);

  return (
    <>
      <Link href="/dashboard/orders" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Órdenes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Recibir equipo</h1>
      <p className="mt-1 text-sm text-zinc-500">Al guardar se genera el folio y puedes imprimir el comprobante.</p>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <OrderForm
          action={createOrderAction}
          submitLabel="Registrar orden"
          cancelHref="/dashboard/orders"
          withPhotos={hasModule(session.modules, "photos")}
          intake={{
            diagnosisFee: repairSettings.diagnosisFee,
            diagnosisCredit: repairSettings.diagnosisCredit,
            canCollect,
            usesCashShift: hasModule(session.modules, "cash"),
            canSeePrices: canSeeOrderPrices(session.permissions),
            hasInventory: hasModule(session.modules, "inventory"),
            accounts: accounts.map((account) => ({
              id: account.id,
              bankName: account.bankName,
              holderName: account.holderName,
              clabe: account.clabe,
              alias: account.alias,
            })),
          }}
        />
      </div>
    </>
  );
}
