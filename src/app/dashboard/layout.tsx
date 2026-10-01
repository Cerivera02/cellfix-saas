import { GraceModal, SubscriptionLine } from "@/components/billing/subscription-notice";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem, NavLink } from "@/components/shell/sidebar";
import { BILLING_PATH, canManageBilling, requireTenantSession } from "@/lib/auth/session";
import { CUSTOMER_ACCESS_PERMISSIONS } from "@/lib/customers/access";
import { hasModule } from "@/lib/modules";
import { ORDER_ACCESS_PERMISSIONS } from "@/lib/orders/labels";
import type { Permission } from "@/lib/permissions";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  // El layout también envuelve la página de suscripción, que sigue abierta con el taller bloqueado;
  // cada página (y cada acción) vuelve a llamar a requireTenantSession y manda ahí si está bloqueado.
  const session = await requireTenantSession({ allowLocked: true });
  const can = (permission: Permission) => session.permissions.includes(permission);
  const canManage = canManageBilling(session);
  const { access } = session;
  const user = { name: session.user.name, email: session.user.email };

  // Bloqueado por falta de pago: solo queda la suscripción (y cerrar sesión).
  if (access.state === "locked") {
    return (
      <AppShell
        context={session.tenant.name}
        homeHref={BILLING_PATH}
        user={user}
        items={[{ href: BILLING_PATH, label: "Suscripción", icon: "card" }]}
      >
        {children}
      </AppShell>
    );
  }

  // Cada opción aparece solo si el usuario tiene el permiso; las páginas lo vuelven a verificar.
  const items: NavItem[] = [{ href: "/dashboard", label: "Inicio", icon: "home" }];

  const orderLinks: NavLink[] = [];
  if (ORDER_ACCESS_PERMISSIONS.some(can)) {
    orderLinks.push({ href: "/dashboard/orders", label: "Órdenes", activePrefix: "/dashboard/orders/" });
  }
  if (can("orders.intake")) orderLinks.push({ href: "/dashboard/orders/new", label: "Recibir equipo" });
  if (orderLinks.length > 0) {
    items.push({ label: "Reparaciones", icon: "wrench", children: orderLinks });
  }

  const cashLinks: NavLink[] = [];
  if (can("sales.create")) cashLinks.push({ href: "/dashboard/cash", label: "Vender" });
  if (can("sales.create") || can("cash.view")) {
    cashLinks.push({ href: "/dashboard/cash/sales", label: "Ventas", activePrefix: "/dashboard/cash/sales/" });
  }
  if (can("cash.operate") || can("cash.view")) {
    cashLinks.push({ href: "/dashboard/cash/shifts", label: "Cortes de caja", activePrefix: "/dashboard/cash/shifts/" });
  }
  if (cashLinks.length > 0) {
    items.push({ label: "Caja", icon: "cash", children: cashLinks });
  }

  if (CUSTOMER_ACCESS_PERMISSIONS.some(can)) {
    items.push({ href: "/dashboard/customers", label: "Clientes", icon: "user", activePrefix: "/dashboard/customers/" });
  }

  const inventoryLinks: NavLink[] = [];
  if (can("inventory.view")) {
    inventoryLinks.push(
      { href: "/dashboard/inventory", label: "Artículos", activePrefix: "/dashboard/inventory/items" },
      { href: "/dashboard/inventory/categories", label: "Categorías" },
      { href: "/dashboard/inventory/suppliers", label: "Proveedores" },
    );
  }
  // inventory.view deja consultar compras, pero solo con el módulo de Compras activo.
  if (hasModule(session.modules, "purchases") && (can("inventory.view") || can("purchases.manage"))) {
    inventoryLinks.push({ href: "/dashboard/purchases", label: "Compras", activePrefix: "/dashboard/purchases/" });
  }
  if (inventoryLinks.length > 0) {
    items.push({ label: "Inventario", icon: "box", children: inventoryLinks });
  }

  const teamLinks: NavLink[] = [];
  if (can("users.manage")) teamLinks.push({ href: "/dashboard/team", label: "Usuarios" });
  if (can("roles.manage")) teamLinks.push({ href: "/dashboard/roles", label: "Roles" });
  if (teamLinks.length > 0) {
    items.push({ label: "Equipo", icon: "users", children: teamLinks });
  }

  if (can("settings.manage")) {
    items.push({ href: "/dashboard/settings", label: "Configuración", icon: "settings", activePrefix: "/dashboard/settings" });
  }
  if (canManage) items.push({ href: BILLING_PATH, label: "Suscripción", icon: "card" });

  return (
    <AppShell
      context={session.tenant.name}
      homeHref="/dashboard"
      user={user}
      items={items}
      notice={
        canManage && access.state !== "active" ? (
          <SubscriptionLine state={access.state} daysLeft={access.daysLeft} canManage={canManage} />
        ) : undefined
      }
    >
      {(access.state === "grace" || access.state === "past_due") && (
        <GraceModal
          tenantId={session.tenant.id}
          state={access.state}
          daysLeft={access.daysLeft ?? 0}
          canManage={canManage}
        />
      )}
      {children}
    </AppShell>
  );
}
