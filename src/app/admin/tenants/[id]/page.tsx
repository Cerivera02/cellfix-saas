import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/status-badge";
import { getTenant } from "@/lib/admin/tenants";
import { MODULES } from "@/lib/modules";
import { SYSTEM_ROLES, SYSTEM_ROLE_KEYS } from "@/lib/permissions";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "long" });

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

const cardLinkClass = "mt-auto pt-4 text-sm font-medium text-zinc-900 hover:underline";

export default async function TenantOverviewPage(props: PageProps<"/admin/tenants/[id]">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const { team } = tenant;
  const base = `/admin/tenants/${tenant.id}`;
  const isActive = tenant.status === "active";
  const owners = team.members.filter((member) => member.systemRoles.includes("owner"));
  const roleSummary = SYSTEM_ROLE_KEYS.map((key) => {
    const count = team.members.filter((member) => member.systemRoles.includes(key)).length;
    return count > 0 ? `${count} ${SYSTEM_ROLES[key].label.toLowerCase()}` : null;
  })
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Estado">
          <div>
            <StatusBadge status={tenant.status} />
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            {isActive ? "Sus usuarios pueden iniciar sesión." : "Sus usuarios no pueden iniciar sesión."}
          </p>
          <Link href={`${base}/settings`} className={cardLinkClass}>
            {isActive ? "Suspender taller →" : "Reactivar taller →"}
          </Link>
        </Card>

        <Card label="Usuarios">
          <p className="text-3xl font-semibold tracking-tight">{team.members.length}</p>
          <p className="mt-1 text-sm text-zinc-600">{roleSummary || "Sin roles asignados"}</p>
          <Link href={`${base}/users`} className={cardLinkClass}>
            Gestionar usuarios →
          </Link>
        </Card>

        <Card label="Roles Custom">
          <p className="text-3xl font-semibold tracking-tight">{team.customRoles.length}</p>
          <p className="mt-1 text-sm text-zinc-600">Además de los 5 roles predefinidos.</p>
          <Link href={`${base}/roles`} className={cardLinkClass}>
            Gestionar roles →
          </Link>
        </Card>

        <Card label="Propietario">
          {owners[0] ? (
            <>
              <p className="font-medium text-zinc-900">{owners[0].name}</p>
              <p className="text-sm break-all text-zinc-500">{owners[0].email}</p>
              {owners.length > 1 && (
                <p className="mt-1 text-sm text-zinc-500">
                  y {owners.length - 1} propietario{owners.length > 2 ? "s" : ""} más
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">Sin propietario</p>
          )}
        </Card>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Acceso</p>
        <p className="mt-3 text-sm text-zinc-600">
          Los usuarios de este taller inician sesión en <span className="font-mono text-zinc-900">/login</span>{" "}
          con su correo y contraseña; ven y hacen solo lo que permiten sus roles. Dado de alta el{" "}
          {dateFormatter.format(tenant.createdAt)}.
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          Módulos opcionales:{" "}
          {tenant.modules.length > 0 ? tenant.modules.map((key) => MODULES[key].label).join(", ") : "ninguno"} ·{" "}
          <Link href={`${base}/modules`} className="font-medium text-zinc-900 hover:underline">
            Cambiar
          </Link>
        </p>
      </div>
    </div>
  );
}
