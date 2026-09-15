import { requireAnyTenantPermission } from "@/lib/auth/session";

// Solo verifica el acceso a Compras; cada página y acción vuelve a verificar su permiso.
export default async function PurchasesLayout({ children }: LayoutProps<"/dashboard/purchases">) {
  await requireAnyTenantPermission(["purchases.manage", "inventory.view"]);
  return children;
}
