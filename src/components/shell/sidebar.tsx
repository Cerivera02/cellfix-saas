"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { Logo } from "@/components/logo";
import { NavIcon, type IconName } from "@/components/shell/nav-icon";
import { logout } from "@/lib/auth/actions";

export type NavLink = {
  href: string;
  label: string;
  // Rutas hijas que también marcan el enlace como activo, p. ej. "/admin/tenants/".
  activePrefix?: string;
};

// Un enlace directo o un grupo desplegable con subsecciones.
export type NavItem = (NavLink & { icon: IconName }) | { label: string; icon: IconName; children: NavLink[] };

export type SidebarProps = {
  context: string;
  homeHref: string;
  user: { name: string; email: string };
  items: NavItem[];
  // Aviso breve sobre la cuenta (p. ej. días de prueba), arriba del usuario.
  notice?: React.ReactNode;
};

// Cuánto coincide la ruta con un enlace; gana la coincidencia más específica,
// así "/admin/tenants/new" marca "Nuevo taller" y no "Todos los talleres".
function matchScore(pathname: string, link: NavLink) {
  if (pathname === link.href) return link.href.length + 1;
  if (link.activePrefix && pathname.startsWith(link.activePrefix)) return link.activePrefix.length;
  return 0;
}

function getActiveHref(pathname: string, items: NavItem[]) {
  let best: { href: string; score: number } | null = null;
  for (const item of items) {
    for (const link of "children" in item ? item.children : [item]) {
      const score = matchScore(pathname, link);
      if (score > 0 && (!best || score > best.score)) best = { href: link.href, score };
    }
  }
  return best?.href ?? null;
}

const itemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition";

function NavGroup({
  item,
  activeHref,
  onNavigate,
}: {
  item: Extract<NavItem, { children: NavLink[] }>;
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  const panelId = useId();
  const containsActive = item.children.some((child) => child.href === activeHref);
  // null = sin elección del usuario: el grupo se abre si contiene la página actual.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const isOpen = expanded ?? containsActive;

  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setExpanded(!isOpen)}
        className={`${itemClass} ${
          containsActive ? "font-medium text-zinc-900 hover:bg-zinc-50" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
        }`}
      >
        <NavIcon name={item.icon} className={`size-5 ${containsActive ? "text-zinc-900" : "text-zinc-400"}`} />
        <span className="flex-1 text-left">{item.label}</span>
        <NavIcon
          name="chevron"
          className={`size-4 text-zinc-400 transition-transform duration-200 motion-reduce:transition-none ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>

      <div
        id={panelId}
        inert={!isOpen}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="py-1">
            {item.children.map((child) => {
              const active = child.href === activeHref;
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`ml-[1.375rem] block border-l py-1.5 pl-[1.3rem] text-sm transition ${
                      active
                        ? "border-zinc-900 font-medium text-zinc-900"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </li>
  );
}

export function Sidebar({ context, homeHref, user, items, notice, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname, items);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <Link href={homeHref} onClick={onNavigate}>
          <Logo />
        </Link>
        <p className="mt-4 truncate text-xs font-medium tracking-wide text-zinc-400 uppercase">{context}</p>
      </div>

      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            if ("children" in item) {
              const containsActive = item.children.some((child) => child.href === activeHref);
              // La key cambia al entrar o salir del grupo: vuelve a abrirse solo si contiene la página actual.
              return (
                <NavGroup
                  key={`${item.label}-${containsActive}`}
                  item={item}
                  activeHref={activeHref}
                  onNavigate={onNavigate}
                />
              );
            }

            const active = item.href === activeHref;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`${itemClass} ${
                    active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <NavIcon name={item.icon} className={`size-5 ${active ? "text-zinc-900" : "text-zinc-400"}`} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* El aviso puede traer un enlace: al seguirlo se cierra el menú móvil. */}
      {notice && (
        <div className="px-6 pb-3" onClick={onNavigate}>
          {notice}
        </div>
      )}

      <div className="border-t border-zinc-100 p-3">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-zinc-900">{user.name}</p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            <NavIcon name="logout" className="size-5 text-zinc-400" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
