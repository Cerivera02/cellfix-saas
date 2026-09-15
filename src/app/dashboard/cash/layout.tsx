import { requireAnyTenantPermission } from "@/lib/auth/session";

// Solo verifica el acceso a la Caja; cada página vuelve a verificar su permiso.
export default async function CashLayout({ children }: LayoutProps<"/dashboard/cash">) {
  await requireAnyTenantPermission(["sales.create", "cash.operate", "cash.view", "settings.manage"]);
  return children;
}
