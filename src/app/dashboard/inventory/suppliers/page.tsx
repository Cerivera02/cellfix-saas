import type { Metadata } from "next";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { SupplierDialogButton } from "@/components/inventory/supplier-dialog-button";
import { ghostButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenantPermission } from "@/lib/auth/session";
import { createSupplierAction, setSupplierActiveAction, updateSupplierAction } from "@/lib/inventory/actions";
import { listSuppliers } from "@/lib/inventory/core";

export const metadata: Metadata = {
  title: "Proveedores — CellFix",
};

export default async function SuppliersPage() {
  const session = await requireTenantPermission("inventory.view");
  const canManage = session.permissions.includes("inventory.manage");
  const suppliers = await listSuppliers(session.tenant.id);

  return (
    <section>
      <PageHeader
        eyebrow="Inventario"
        title="Proveedores"
        description="Dónde compra el taller sus productos y refacciones."
        actions={
          canManage && (
            <SupplierDialogButton
              label="Nuevo proveedor"
              title="Nuevo proveedor"
              action={createSupplierAction}
              submitLabel="Crear proveedor"
            />
          )
        }
      />

      {suppliers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">Aún no hay proveedores</p>
          <p className="mt-1 text-sm text-zinc-500">Regístralos para saber a quién le compras cada artículo.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">RFC</th>
                <th className="px-5 py-3 font-medium">Artículos</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className={`align-top ${supplier.isActive ? "" : "bg-zinc-50/60"}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900">{supplier.name}</p>
                      {!supplier.isActive && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Archivado</span>
                      )}
                    </div>
                    {supplier.address && <p className="mt-0.5 max-w-xs text-xs text-zinc-500">{supplier.address}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    {supplier.contactName || supplier.phone || supplier.email ? (
                      <>
                        {supplier.contactName && <p className="text-zinc-900">{supplier.contactName}</p>}
                        {supplier.phone && <p className="text-xs text-zinc-500">{supplier.phone}</p>}
                        {supplier.email && <p className="text-xs text-zinc-500">{supplier.email}</p>}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-zinc-600">{supplier.taxId || "—"}</td>
                  <td className="px-5 py-3.5 text-zinc-700 tabular-nums">{supplier.itemCount}</td>
                  <td className="px-5 py-3.5">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <SupplierDialogButton
                          label="Editar"
                          variant="ghost"
                          title={`Editar ${supplier.name}`}
                          action={updateSupplierAction.bind(null, supplier.id)}
                          defaults={{
                            name: supplier.name,
                            contactName: supplier.contactName,
                            phone: supplier.phone,
                            email: supplier.email,
                            taxId: supplier.taxId,
                            address: supplier.address,
                            notes: supplier.notes,
                          }}
                          submitLabel="Guardar"
                        />
                        <form action={setSupplierActiveAction.bind(null, supplier.id, !supplier.isActive)}>
                          <ConfirmSubmitButton
                            message={
                              supplier.isActive
                                ? `¿Archivar ${supplier.name}? Ya no aparecerá al elegir proveedor, pero conserva su historial.`
                                : undefined
                            }
                            className={ghostButtonClass}
                          >
                            {supplier.isActive ? "Archivar" : "Reactivar"}
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
