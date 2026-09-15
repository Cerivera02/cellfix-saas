import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/inventory/item-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { updateItemAction } from "@/lib/inventory/actions";
import { getItem, listCategories, listSuppliers } from "@/lib/inventory/core";

export const metadata: Metadata = {
  title: "Editar artículo — CellFix",
};

export default async function EditItemPage(props: PageProps<"/dashboard/inventory/items/[id]/edit">) {
  const session = await requireTenantPermission("inventory.manage");
  const { id } = await props.params;

  const [data, categories, suppliers] = await Promise.all([
    getItem(session.tenant.id, id),
    listCategories(session.tenant.id),
    listSuppliers(session.tenant.id),
  ]);
  if (!data) notFound();

  const { item } = data;
  const detailHref = `/dashboard/inventory/items/${item.id}`;

  return (
    <>
      <Link href={detailHref} className="text-sm text-zinc-500 hover:text-zinc-900">
        ← {item.name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Editar artículo</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Las existencias no se editan aquí: usa “Registrar movimiento” para que quede en el historial.
      </p>

      <div className="mt-6 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <ItemForm
          action={updateItemAction.bind(null, item.id)}
          categories={categories.map((category) => ({ value: category.id, label: category.name }))}
          suppliers={suppliers
            // Un proveedor archivado sigue visible si es el que ya tiene el artículo.
            .filter((supplier) => supplier.isActive || supplier.id === item.supplierId)
            .map((supplier) => ({
              value: supplier.id,
              label: supplier.isActive ? supplier.name : `${supplier.name} (archivado)`,
            }))}
          defaults={{
            name: item.name,
            description: item.description,
            barcode: item.barcode ?? "",
            isForSale: item.isForSale,
            isRepairPart: item.isRepairPart,
            categoryId: item.categoryId ?? "",
            supplierId: item.supplierId ?? "",
            purchasePrice: item.purchasePrice,
            salePrice: item.salePrice,
            laborPrice: item.laborPrice,
            minStock: String(item.minStock),
            trackStock: item.trackStock,
            taxRate: String(Number(item.taxRate)),
            taxIncluded: item.taxIncluded,
          }}
          currentStock={item.stock}
          withInitialStock={false}
          submitLabel="Guardar cambios"
          cancelHref={detailHref}
        />
      </div>
    </>
  );
}
