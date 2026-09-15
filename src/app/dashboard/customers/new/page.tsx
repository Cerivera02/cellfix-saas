import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/customers/customer-form";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { createCustomerAction } from "@/lib/customers/actions";

export const metadata: Metadata = {
  title: "Nuevo cliente — CellFix",
};

export default async function NewCustomerPage() {
  await requireAnyTenantPermission(["customers.manage", "sales.create", "orders.intake"]);

  return (
    <>
      <Link href="/dashboard/customers" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Clientes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Nuevo cliente</h1>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <CustomerForm action={createCustomerAction} submitLabel="Registrar cliente" cancelHref="/dashboard/customers" />
      </div>
    </>
  );
}
