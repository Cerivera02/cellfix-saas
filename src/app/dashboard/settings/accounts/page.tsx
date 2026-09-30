import type { Metadata } from "next";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { BankAccountDialogButton } from "@/components/cash/bank-account-dialog-button";
import { ghostButtonClass } from "@/components/ui/form";
import { requireTenantPermission } from "@/lib/auth/session";
import { createBankAccountAction, setBankAccountActiveAction, updateBankAccountAction } from "@/lib/cash/actions";
import { listBankAccounts } from "@/lib/cash/core";
import { formatClabe } from "@/lib/cash/format";

export const metadata: Metadata = {
  title: "Cuentas bancarias — CellFix",
};

// Cuentas para cobrar con transferencia, en ventas y en órdenes (con o sin el módulo de Caja).
export default async function BankAccountsPage() {
  const session = await requireTenantPermission("settings.manage");
  const accounts = await listBankAccounts(session.tenant.id, { activeOnly: false });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Cuentas bancarias</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Cuentas donde el taller recibe transferencias; sus datos se muestran al cobrar.
          </p>
        </div>
        <BankAccountDialogButton
          label="Nueva cuenta"
          title="Nueva cuenta bancaria"
          action={createBankAccountAction}
          submitLabel="Agregar cuenta"
        />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">Aún no hay cuentas bancarias</p>
          <p className="mt-1 text-sm text-zinc-500">Agrégalas para poder cobrar con transferencia.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Cuenta</th>
                <th className="px-5 py-3 font-medium">Titular</th>
                <th className="px-5 py-3 font-medium">CLABE</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {accounts.map((account) => (
                <tr key={account.id} className={account.isActive ? "" : "bg-zinc-50/60"}>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900">{account.bankName}</p>
                      {!account.isActive && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Archivada</span>
                      )}
                    </div>
                    {account.alias && <p className="text-xs text-zinc-500">{account.alias}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-700">{account.holderName}</td>
                  <td className="px-5 py-3.5 font-mono text-xs whitespace-nowrap text-zinc-700">{formatClabe(account.clabe)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <BankAccountDialogButton
                        label="Editar"
                        variant="ghost"
                        title="Editar cuenta bancaria"
                        action={updateBankAccountAction.bind(null, account.id)}
                        defaults={{
                          bankName: account.bankName,
                          holderName: account.holderName,
                          clabe: account.clabe,
                          alias: account.alias,
                        }}
                        submitLabel="Guardar"
                      />
                      <form action={setBankAccountActiveAction.bind(null, account.id, !account.isActive)}>
                        <ConfirmSubmitButton
                          message={
                            account.isActive
                              ? `¿Archivar la cuenta ${account.bankName}${account.alias ? ` (${account.alias})` : ""}? Ya no aparecerá al cobrar.`
                              : undefined
                          }
                          className={ghostButtonClass}
                        >
                          {account.isActive ? "Archivar" : "Reactivar"}
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
