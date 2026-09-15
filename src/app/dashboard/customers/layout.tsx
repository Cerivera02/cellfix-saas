import { requireAnyTenantPermission } from "@/lib/auth/session";
import { CUSTOMER_ACCESS_PERMISSIONS } from "@/lib/customers/access";

// Solo verifica el acceso a Clientes; cada página vuelve a verificar su permiso.
export default async function CustomersLayout({ children }: LayoutProps<"/dashboard/customers">) {
  await requireAnyTenantPermission(CUSTOMER_ACCESS_PERMISSIONS);
  return children;
}
