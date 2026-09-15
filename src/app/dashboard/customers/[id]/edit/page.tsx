import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customers/customer-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { updateCustomerAction } from "@/lib/customers/actions";
import { getCustomer } from "@/lib/customers/core";

export const metadata: Metadata = {
  title: "Editar cliente — CellFix",
};

export default async function EditCustomerPage(props: PageProps<"/dashboard/customers/[id]/edit">) {
  const session = await requireTenantPermission("customers.manage");
  const { id } = await props.params;

  const data = await getCustomer(session.tenant.id, id);
  if (!data) notFound();

  const { customer } = data;
  const detailHref = `/dashboard/customers/${customer.id}`;

  return (
    <>
      <Link href={detailHref} className="text-sm text-zinc-500 hover:text-zinc-900">
        ← {customer.fullName}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Editar cliente</h1>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <CustomerForm
          action={updateCustomerAction.bind(null, customer.id)}
          defaults={{
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone,
            email: customer.email,
            notes: customer.notes,
            requiresInvoice: customer.tax !== null,
            taxId: customer.tax?.taxId ?? "",
            legalName: customer.tax?.legalName ?? "",
            taxRegime: customer.tax?.taxRegime ?? "",
            taxZipCode: customer.tax?.taxZipCode ?? "",
            cfdiUse: customer.tax?.cfdiUse ?? "",
            billingEmail: customer.billingEmail,
          }}
          submitLabel="Guardar cambios"
          cancelHref={detailHref}
        />
      </div>
    </>
  );
}
