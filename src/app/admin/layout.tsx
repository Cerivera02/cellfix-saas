import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/sidebar";
import { requirePlatformAdmin } from "@/lib/auth/session";

const NAV_ITEMS: NavItem[] = [
  {
    label: "Talleres",
    icon: "store",
    children: [
      { href: "/admin", label: "Todos los talleres", activePrefix: "/admin/tenants/" },
      { href: "/admin/tenants/new", label: "Nuevo taller" },
    ],
  },
];

// El layout solo arma la navegación; cada página y acción vuelve a verificar
// al administrador a través de la capa de datos.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requirePlatformAdmin();

  return (
    <AppShell
      context="Panel administrativo"
      homeHref="/admin"
      user={{ name: session.user.name, email: session.user.email }}
      items={NAV_ITEMS}
    >
      {children}
    </AppShell>
  );
}
