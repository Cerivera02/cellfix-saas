import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubscriptionBadge } from "@/components/admin/subscription-badge";
import { primaryButtonClass } from "@/components/ui/form";
import { listTenants } from "@/lib/admin/tenants";

export const metadata: Metadata = {
  title: "Talleres — Panel administrativo — CellFix",
};

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export default async function AdminPage() {
  const tenants = await listTenants();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Talleres</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {tenants.length === 1 ? "1 taller registrado" : `${tenants.length} talleres registrados`}
          </p>
        </div>
        <Link href="/admin/tenants/new" className={primaryButtonClass}>
          Nuevo taller
        </Link>
      </div>

      {tenants.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">Aún no hay talleres</p>
          <p className="mt-1 text-sm text-zinc-500">Crea el primero para que su propietario pueda iniciar sesión.</p>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Taller</th>
                <th className="px-5 py-3 font-medium">Propietario</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Suscripción</th>
                <th className="px-5 py-3 font-medium">Usuarios</th>
                <th className="px-5 py-3 font-medium">Alta</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Ver</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tenants.map((tenant) => (
                // El enlace del nombre cubre toda la fila, así que cualquier clic abre el taller.
                <tr key={tenant.id} className="group relative transition hover:bg-zinc-50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                    >
                      {tenant.name}
                    </Link>
                    <p className="font-mono text-xs text-zinc-400">{tenant.slug}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    {tenant.ownerName ? (
                      <>
                        <p className="text-zinc-900">{tenant.ownerName}</p>
                        <p className="text-xs text-zinc-500">{tenant.ownerEmail}</p>
                      </>
                    ) : (
                      <span className="text-zinc-400">Sin propietario</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <SubscriptionBadge access={tenant.access} status={tenant.subscriptionStatus} />
                  </td>
                  <td className="px-5 py-3.5 text-zinc-700">{tenant.userCount}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500">
                    {dateFormatter.format(tenant.createdAt)}
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
    </>
  );
}
