import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubscriptionBadge } from "@/components/admin/subscription-badge";
import { TenantTabs } from "@/components/admin/tenant-tabs";
import { getTenant } from "@/lib/admin/tenants";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tenant = await getTenant(id);
  return { title: `${tenant?.name ?? "Taller"} — Panel administrativo — CellFix` };
}

// Encabezado y pestañas compartidos por Resumen, Usuarios, Roles, Módulos y Configuración.
export default async function TenantLayout({ children, params }: LayoutProps<"/admin/tenants/[id]">) {
  const { id } = await params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  return (
    <>
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Talleres
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        <StatusBadge status={tenant.status} />
        <SubscriptionBadge access={tenant.subscription.access} status={tenant.subscription.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-zinc-500">{tenant.slug}</p>

      <TenantTabs tenantId={tenant.id} userCount={tenant.team.members.length} />

      <div className="mt-8">{children}</div>
    </>
  );
}
