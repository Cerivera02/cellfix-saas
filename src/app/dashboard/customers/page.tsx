import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { CUSTOMER_ACCESS_PERMISSIONS } from "@/lib/customers/access";
import { listCustomers } from "@/lib/customers/core";

export const metadata: Metadata = {
  title: "Clientes — CellFix",
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

export default async function CustomersPage(props: PageProps<"/dashboard/customers">) {
  const session = await requireAnyTenantPermission(CUSTOMER_ACCESS_PERMISSIONS);
  const canCreate = (["customers.manage", "sales.create", "orders.intake"] as const).some((permission) =>
    session.permissions.includes(permission),
  );

  const searchParams = await props.searchParams;
  const search = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const archived = searchParams.archivados === "1";
  const customers = await listCustomers(session.tenant.id, { search, archived });

  const tabHref = (showArchived: boolean) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (showArchived) params.set("archivados", "1");
    const query = params.toString();
    return query ? `/dashboard/customers?${query}` : "/dashboard/customers";
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Personas a las que se les vende o repara; su historial sirve para garantías."
        actions={
          canCreate && (
            <Link href="/dashboard/customers/new" className={primaryButtonClass}>
              Nuevo cliente
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Form action="/dashboard/customers" className="flex w-full max-w-md gap-2">
          {archived && <input type="hidden" name="archivados" value="1" />}
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Buscar por nombre, teléfono, correo o RFC"
            aria-label="Buscar clientes"
            className={inputClass}
          />
          <button type="submit" className={secondaryButtonClass}>
            Buscar
          </button>
        </Form>

        <nav aria-label="Estado" className="flex gap-2">
          {[
            { label: "Activos", value: false },
            { label: "Archivados", value: true },
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tabHref(tab.value)}
              aria-current={archived === tab.value ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                archived === tab.value
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium">{search ? "Sin resultados" : archived ? "No hay clientes archivados" : "Aún no hay clientes"}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {search ? "Prueba con otro nombre, teléfono o RFC." : "Se registran aquí o al cobrar en la caja."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Teléfono</th>
                <th className="px-5 py-3 font-medium">RFC</th>
                <th className="px-5 py-3 font-medium">Compras</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Ver</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {customers.map((customer) => (
                <tr key={customer.id} className="group relative transition hover:bg-zinc-50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="font-medium text-zinc-900 after:absolute after:inset-0 after:content-['']"
                    >
                      {customer.fullName}
                    </Link>
                    {customer.email && <p className="text-xs text-zinc-500">{customer.email}</p>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-zinc-700 tabular-nums">{customer.phone || "—"}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-zinc-600">{customer.taxId ?? "—"}</td>
                  <td className="px-5 py-3.5 text-zinc-700">
                    {customer.salesCount === 0 ? (
                      <span className="text-zinc-400">Sin compras</span>
                    ) : (
                      <>
                        <p className="tabular-nums">{customer.salesCount}</p>
                        {customer.lastSaleAt && (
                          <p className="text-xs text-zinc-500">Última: {dateFormatter.format(customer.lastSaleAt)}</p>
                        )}
                      </>
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

      {customers.length === 200 && (
        <p className="mt-3 text-xs text-zinc-500">Se muestran los primeros 200; usa la búsqueda para encontrar el resto.</p>
      )}
    </>
  );
}
