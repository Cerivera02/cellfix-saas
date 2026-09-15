import type { Metadata } from "next";
import { CategoryActions } from "@/components/inventory/category-actions";
import { CategoryCreateForm } from "@/components/inventory/category-create-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenantPermission } from "@/lib/auth/session";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from "@/lib/inventory/actions";
import { listCategories } from "@/lib/inventory/core";

export const metadata: Metadata = {
  title: "Categorías — CellFix",
};

export default async function CategoriesPage() {
  const session = await requireTenantPermission("inventory.view");
  const canManage = session.permissions.includes("inventory.manage");
  const categories = await listCategories(session.tenant.id);

  return (
    <>
      <PageHeader eyebrow="Inventario" title="Categorías" description="Agrupa los artículos para encontrarlos rápido." />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {categories.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-medium">Aún no hay categorías</p>
              <p className="mt-1 text-sm text-zinc-500">Agrupa tus artículos: pantallas, baterías, cargadores…</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{category.name}</p>
                    <p className="text-xs text-zinc-500">
                      {category.itemCount === 1 ? "1 artículo" : `${category.itemCount} artículos`}
                    </p>
                  </div>
                  {canManage && (
                    <CategoryActions
                      name={category.name}
                      renameAction={renameCategoryAction.bind(null, category.id)}
                      deleteAction={deleteCategoryAction.bind(null, category.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="font-medium">Nueva categoría</h2>
            <div className="mt-4">
              <CategoryCreateForm action={createCategoryAction} />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
