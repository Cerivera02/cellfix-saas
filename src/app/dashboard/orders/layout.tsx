import { requireAnyTenantPermission } from "@/lib/auth/session";
import { ORDER_ACCESS_PERMISSIONS } from "@/lib/orders/labels";

// Solo verifica el acceso a Órdenes; cada página y acción vuelve a verificar su permiso.
export default async function OrdersLayout({ children }: LayoutProps<"/dashboard/orders">) {
  await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  return children;
}
