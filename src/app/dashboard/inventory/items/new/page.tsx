import type { Metadata } from "next";
import Link from "next/link";
import { ItemForm } from "@/components/inventory/item-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { createItemAction } from "@/lib/inventory/actions";
import { listCategories, listSuppliers } from "@/lib/inventory/core";

export const metadata: Metadata = {
  title: "Nuevo artículo — CellFix",
};

export default async function NewItemPage() {
  const session = await requireTenantPermission("inventory.manage");
  const [categories, suppliers] = await Promise.all([
    listCategories(session.tenant.id),
    listSuppliers(session.tenant.id),
  ]);

  return (
    <>
      <Link href="/dashboard/inventory" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Artículos
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Nuevo artículo</h1>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <ItemForm
          action={createItemAction}
          categories={categories.map((category) => ({ value: category.id, label: category.name }))}
          suppliers={suppliers
            .filter((supplier) => supplier.isActive)
            .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          withInitialStock
          submitLabel="Crear artículo"
          cancelHref="/dashboard/inventory"
        />
      </div>
    </>
  );
}
