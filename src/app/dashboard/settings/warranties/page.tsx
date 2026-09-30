import type { Metadata } from "next";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { WarrantyDialogButton } from "@/components/settings/warranty-dialog-button";
import { ghostButtonClass } from "@/components/ui/form";
import { requireTenantPermission } from "@/lib/auth/session";
import { createWarrantyAction, setWarrantyActiveAction, updateWarrantyAction } from "@/lib/settings/actions";
import { listWarranties } from "@/lib/warranties/core";

export const metadata: Metadata = {
  title: "Garantías — CellFix",
};

// Catálogo de garantías: al entregar un equipo reparado se elige una de las activas.
export default async function WarrantiesPage() {
  const session = await requireTenantPermission("settings.manage");
  const warranties = await listWarranties(session.tenant.id, { activeOnly: false });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Garantías</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Opciones que se eligen al entregar un equipo reparado; se imprimen en el ticket de entrega.
          </p>
        </div>
        <WarrantyDialogButton
          label="Nueva garantía"
          title="Nueva garantía"
          action={createWarrantyAction}
          submitLabel="Agregar garantía"
        />
      </div>

      {warranties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">Aún no hay garantías</p>
          <p className="mt-1 text-sm text-zinc-500">Sin garantías, los equipos reparados se entregan sin garantía.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Garantía</th>
                <th className="px-5 py-3 font-medium">Días</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {warranties.map((warranty) => (
                <tr key={warranty.id} className={warranty.isActive ? "" : "bg-zinc-50/60"}>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900">{warranty.name}</p>
                      {!warranty.isActive && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Archivada</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-700 tabular-nums">{warranty.days}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <WarrantyDialogButton
                        label="Editar"
                        variant="ghost"
                        title="Editar garantía"
                        action={updateWarrantyAction.bind(null, warranty.id)}
                        defaults={{ name: warranty.name, days: String(warranty.days) }}
                        submitLabel="Guardar"
                      />
                      <form action={setWarrantyActiveAction.bind(null, warranty.id, !warranty.isActive)}>
                        <ConfirmSubmitButton
                          message={
                            warranty.isActive
                              ? `¿Archivar la garantía ${warranty.name}? Ya no aparecerá al entregar.`
                              : undefined
                          }
                          className={ghostButtonClass}
                        >
                          {warranty.isActive ? "Archivar" : "Reactivar"}
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
