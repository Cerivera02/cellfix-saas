import { redirect } from "next/navigation";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { hasModule } from "@/lib/modules";

// Solo verifica el acceso a Compras; cada página y acción vuelve a verificar su permiso.
// inventory.view deja consultar compras, pero solo si el módulo de Compras está activo.
export default async function PurchasesLayout({ children }: LayoutProps<"/dashboard/purchases">) {
  const session = await requireAnyTenantPermission(["purchases.manage", "inventory.view"]);
  if (!hasModule(session.modules, "purchases")) redirect("/dashboard?aviso=modulo-inactivo");
  return children;
}
