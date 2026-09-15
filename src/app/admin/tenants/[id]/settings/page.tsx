import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { TenantNameForm } from "@/components/admin/tenant-name-form";
import { secondaryButtonClass } from "@/components/ui/form";
import { setTenantStatusAction, updateTenantNameAction } from "@/lib/admin/actions";
import { getTenant } from "@/lib/admin/tenants";

export default async function TenantSettingsPage(props: PageProps<"/admin/tenants/[id]/settings">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const isActive = tenant.status === "active";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-medium">Nombre del taller</h2>
        <p className="mt-1 text-sm text-zinc-500">Es el nombre que verán sus usuarios en su panel.</p>
        <div className="mt-4">
          <TenantNameForm defaultName={tenant.name} action={updateTenantNameAction.bind(null, tenant.id)} />
        </div>
      </section>

      <section className={`rounded-2xl border bg-white p-6 ${isActive ? "border-red-200" : "border-zinc-200"}`}>
        <h2 className="font-medium">{isActive ? "Suspender taller" : "Reactivar taller"}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {isActive
            ? "Sus usuarios perderán el acceso de inmediato y no podrán iniciar sesión hasta que lo reactives. No se borra ningún dato."
            : "El taller está suspendido. Al reactivarlo, sus usuarios podrán volver a iniciar sesión."}
        </p>
        <form action={setTenantStatusAction.bind(null, tenant.id, isActive ? "suspended" : "active")} className="mt-4">
          {isActive ? (
            <ConfirmSubmitButton
              message={`¿Suspender ${tenant.name}? Sus usuarios perderán el acceso de inmediato.`}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              Suspender taller
            </ConfirmSubmitButton>
          ) : (
            <ConfirmSubmitButton className={secondaryButtonClass}>Reactivar taller</ConfirmSubmitButton>
          )}
        </form>
      </section>
    </div>
  );
}
