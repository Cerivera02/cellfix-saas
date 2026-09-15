import { requireTenantPermission } from "@/lib/auth/session";

// Solo verifica el acceso; la navegación entre secciones está en el menú lateral
// y cada página vuelve a verificar su permiso.
export default async function InventoryLayout({ children }: LayoutProps<"/dashboard/inventory">) {
  await requireTenantPermission("inventory.view");
  return children;
}
