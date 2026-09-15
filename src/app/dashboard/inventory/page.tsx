import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { KindBadges } from "@/components/inventory/kind-badges";
import { StockBadge } from "@/components/inventory/stock-badge";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenantPermission } from "@/lib/auth/session";
import { listItems, type ItemFilter } from "@/lib/inventory/core";
import { formatMoney, formatRate } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Inventario — CellFix",
};

const FILTERS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "low", label: "Por agotarse" },
  { value: "sale", label: "A la venta" },
  { value: "parts", label: "Refacciones" },
  { value: "archived", label: "Archivados" },
];

export default async function InventoryPage(props: PageProps<"/dashboard/inventory">) {
  const session = await requireTenantPermission("inventory.view");
  const canManage = session.permissions.includes("inventory.manage");

  const searchParams = await props.searchParams;
  const search = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const filter = FILTERS.find((option) => option.value === searchParams.filter)?.value ?? "all";

  const { items, counts } = await listItems(session.tenant.id, { search, filter });
  const isEmptyInventory = counts.all === 0 && counts.archived === 0;

  const filterHref = (value: ItemFilter) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (value !== "all") params.set("filter", value);
    const query = params.toString();
    return query ? `/dashboard/inventory?${query}` : "/dashboard/inventory";
  };

  return (
    <>
      <PageHeader eyebrow="Inventario" title="Artículos" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Un lector de códigos de barras escribe el código y pulsa Enter: busca directo. */}
        <Form action="/dashboard/inventory" className="flex w-full max-w-md gap-2">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Buscar por nombre o código de barras"
            aria-label="Buscar artículos"
            className={inputClass}
          />
          <button type="submit" className={secondaryButtonClass}>
            Buscar
          </button>
        </Form>
        {canManage && (
          <Link href="/dashboard/inventory/items/new" className={primaryButtonClass}>
            Nuevo artículo
          </Link>
        )}
      </div>

      <nav aria-label="Filtros" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <Link
              key={option.value}
              href={filterHref(option.value)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
              }`}
            >
              {option.label} <span className={active ? "text-zinc-400" : "text-zinc-400"}>{counts[option.value]}</span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          {isEmptyInventory && !search ? (
            <>
              <p className="font-medium">Aún no hay artículos</p>
              <p className="mt-1 text-sm text-zinc-500">
                {canManage
                  ? "Registra tu primer artículo para empezar a llevar el inventario."
                  : "Cuando se registren artículos aparecerán aquí."}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Sin resultados</p>
              <p className="mt-1 text-sm text-zinc-500">Prueba con otra búsqueda o filtro.</p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Artículo</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 text-right font-medium">Precio de venta</th>
                <th className="px-5 py-3 text-right font-medium">Existencias</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Ver</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((item) => (
                // El enlace del nombre cubre toda la fila, así que cualquier clic abre el artículo.
                <tr key={item.id} className="group relative transition hover:bg-zinc-50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/dashboard/inventory/items/${item.id}`}
                      className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {item.categoryName ?? "Sin categoría"}
                      {item.barcode && <span className="font-mono"> · {item.barcode}</span>}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <KindBadges isForSale={item.isForSale} isRepairPart={item.isRepairPart} />
                  </td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap text-zinc-900 tabular-nums">
                    {formatMoney(item.salePrice)}
                    {!item.taxIncluded && Number(item.taxRate) > 0 && (
                      <span className="block text-xs text-zinc-400">+ IVA {formatRate(item.taxRate)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {item.trackStock ? (
                      <div className="flex items-center justify-end gap-2">
                        <StockBadge stock={item.stock} minStock={item.minStock} />
                        <span className="font-medium text-zinc-900 tabular-nums">{item.stock}</span>
                      </div>
                    ) : (
                      <p className="text-right text-xs whitespace-nowrap text-zinc-400">No se controla</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg text-zinc-300 transition group-hover:text-zinc-900">
                    <span aria-hidden="true">›</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 500 && (
        <p className="mt-3 text-xs text-zinc-500">Se muestran los primeros 500; usa la búsqueda para encontrar el resto.</p>
      )}
    </>
  );
}
