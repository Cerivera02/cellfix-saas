import type { Metadata } from "next";
import { OpenShiftForm } from "@/components/cash/open-shift-form";
import { Pos } from "@/components/cash/pos";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenantPermission } from "@/lib/auth/session";
import { openShiftAction } from "@/lib/cash/actions";
import { getOpenShift, listBankAccounts } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";

export const metadata: Metadata = {
  title: "Vender — CellFix",
};

export default async function SellPage() {
  const session = await requireTenantPermission("sales.create");
  const canOperate = session.permissions.includes("cash.operate");

  const [shift, accounts] = await Promise.all([
    getOpenShift(session.tenant.id),
    listBankAccounts(session.tenant.id, { activeOnly: true }),
  ]);

  if (!shift) {
    return (
      <>
        <PageHeader eyebrow="Caja" title="Vender" />
        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="font-medium">La caja está cerrada</p>
          <p className="mt-1 text-sm text-zinc-500">
            {canOperate
              ? "Ábrela con el efectivo inicial para empezar a vender."
              : "Pide a quien opera la caja que la abra para poder vender."}
          </p>
          {canOperate && (
            <div className="mt-6">
              <OpenShiftForm action={openShiftAction} />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Caja"
        title="Vender"
        description={`Caja abierta${shift.openedByName ? ` por ${shift.openedByName}` : ""} · ${dateTimeFormatter.format(shift.openedAt)}`}
      />
      <Pos
        accounts={accounts.map((account) => ({
          id: account.id,
          bankName: account.bankName,
          holderName: account.holderName,
          clabe: account.clabe,
          alias: account.alias,
        }))}
      />
    </>
  );
}
