import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { KindBadges } from "@/components/inventory/kind-badges";
import { MovementDialog } from "@/components/inventory/movement-dialog";
import { StockBadge } from "@/components/inventory/stock-badge";
import { secondaryButtonClass } from "@/components/ui/form";
import { requireTenantPermission } from "@/lib/auth/session";
import { recordMovementAction, setItemActiveAction } from "@/lib/inventory/actions";
import { getItem, listSuppliers } from "@/lib/inventory/core";
import { MOVEMENT_LABELS, describeTax, formatMoney } from "@/lib/inventory/format";

export const metadata: Metadata = {
  title: "Artículo — CellFix",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

function Stat({ label, value, detail, mono }: { label: string; value: React.ReactNode; detail?: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight break-all tabular-nums ${mono ? "font-mono text-base" : ""}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-sm text-zinc-500">{detail}</p>}
    </div>
  );
}

export default async function ItemPage(props: PageProps<"/dashboard/inventory/items/[id]">) {
  const session = await requireTenantPermission("inventory.view");
  const canManage = session.permissions.includes("inventory.manage");
  const { id } = await props.params;

  const data = await getItem(session.tenant.id, id);
  if (!data) notFound();

  const { item, movements } = data;
  const suppliers =
    canManage && item.isActive && item.trackStock
      ? (await listSuppliers(session.tenant.id))
          .filter((supplier) => supplier.isActive)
          .map((supplier) => ({ value: supplier.id, label: supplier.name }))
      : [];

  const purchase = Number(item.purchasePrice);
  const margin = purchase > 0 ? Math.round(((Number(item.salePrice) - purchase) / purchase) * 100) : null;

  return (
    <>
      <Link href="/dashboard/inventory" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Artículos
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
            {!item.isActive && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Archivado</span>
            )}
            {item.trackStock && <StockBadge stock={item.stock} minStock={item.minStock} />}
          </div>
          <div className="mt-2">
            <KindBadges isForSale={item.isForSale} isRepairPart={item.isRepairPart} />
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {item.isActive && item.trackStock && (
              <MovementDialog
                action={recordMovementAction.bind(null, item.id)}
                suppliers={suppliers}
                defaultSupplierId={item.supplierId}
                purchasePrice={item.purchasePrice}
              />
            )}
            <Link href={`/dashboard/inventory/items/${item.id}/edit`} className={secondaryButtonClass}>
              Editar
            </Link>
            <form action={setItemActiveAction.bind(null, item.id, !item.isActive)}>
              <ConfirmSubmitButton
                message={
                  item.isActive
                    ? `¿Archivar ${item.name}? Dejará de aparecer en el inventario, pero conserva su historial.`
                    : undefined
                }
                className={secondaryButtonClass}
              >
                {item.isActive ? "Archivar" : "Reactivar"}
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {item.trackStock ? (
          <Stat label="Existencias" value={item.stock} detail={`Mínimo: ${item.minStock}`} />
        ) : (
          <Stat label="Existencias" value="No se controla" detail="Este artículo no lleva conteo." />
        )}
        <Stat
          label="Precio de venta"
          value={formatMoney(item.salePrice)}
          detail={
            item.isRepairPart && Number(item.laborPrice) > 0
              ? `${describeTax(item.taxRate, item.taxIncluded)} · Mano de obra ${formatMoney(item.laborPrice)}`
              : describeTax(item.taxRate, item.taxIncluded)
          }
        />
        <Stat
          label="Precio de compra"
          value={formatMoney(item.purchasePrice)}
          detail={margin !== null ? `Margen: ${margin}%` : undefined}
        />
        <Stat label="Código de barras" value={item.barcode ?? "—"} mono />
      </div>

      <dl className="mt-4 grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Categoría</dt>
          <dd className="mt-1 text-zinc-900">{item.categoryName ?? "Sin categoría"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Proveedor principal</dt>
          <dd className="mt-1 text-zinc-900">{item.supplierName ?? "Sin proveedor"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Última actualización</dt>
          <dd className="mt-1 text-zinc-900">{dateTimeFormatter.format(item.updatedAt)}</dd>
        </div>
        {item.description && (
          <div className="sm:col-span-3">
            <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Descripción</dt>
            <dd className="mt-1 whitespace-pre-line text-zinc-700">{item.description}</dd>
          </div>
        )}
      </dl>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Historial de movimientos</h2>

        {movements.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">Aún no hay movimientos para este artículo.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Movimiento</th>
                  <th className="px-5 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-5 py-3 text-right font-medium">Existencias</th>
                  <th className="px-5 py-3 text-right font-medium">Costo unitario</th>
                  <th className="px-5 py-3 font-medium">Proveedor</th>
                  <th className="px-5 py-3 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {movements.map((movement) => (
                  <tr key={movement.id} className="align-top">
                    <td className="px-5 py-3 whitespace-nowrap text-zinc-500">
                      {dateTimeFormatter.format(movement.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-zinc-900">{MOVEMENT_LABELS[movement.kind]}</p>
                      {movement.note && <p className="text-xs text-zinc-500">{movement.note}</p>}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                        movement.quantity > 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {movement.quantity > 0 ? `+${movement.quantity}` : `−${Math.abs(movement.quantity)}`}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-900 tabular-nums">{movement.stockAfter}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap text-zinc-700 tabular-nums">
                      {movement.unitCost !== null ? formatMoney(movement.unitCost) : "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-700">{movement.supplierName ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-700">{movement.userName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
