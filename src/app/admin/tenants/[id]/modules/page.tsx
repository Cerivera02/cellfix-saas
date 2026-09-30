import { notFound } from "next/navigation";
import { TenantModulesForm } from "@/components/admin/tenant-modules-form";
import { setTenantModulesAction } from "@/lib/admin/actions";
import { getTenant } from "@/lib/admin/tenants";

export default async function TenantModulesPage(props: PageProps<"/admin/tenants/[id]/modules">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  return (
    <section className="max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="font-medium">Módulos</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Elige qué partes de CellFix usa este taller. Apagar un módulo lo oculta del menú y de los permisos, pero
        conserva sus datos; al volver a activarlo aparece todo como estaba.
      </p>
      <div className="mt-5">
        <TenantModulesForm defaultModules={tenant.modules} action={setTenantModulesAction.bind(null, tenant.id)} />
      </div>
    </section>
  );
}
