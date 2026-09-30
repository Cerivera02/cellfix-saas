"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TenantTabs({ tenantId, userCount }: { tenantId: string; userCount: number }) {
  const pathname = usePathname();
  const base = `/admin/tenants/${tenantId}`;
  const tabs = [
    { href: base, label: "Resumen" },
    { href: `${base}/users`, label: "Usuarios", count: userCount },
    { href: `${base}/roles`, label: "Roles" },
    { href: `${base}/modules`, label: "Módulos" },
    { href: `${base}/subscription`, label: "Suscripción" },
    { href: `${base}/settings`, label: "Configuración" },
  ];

  return (
    <nav aria-label="Secciones del taller" className="mt-6 border-b border-zinc-200">
      <ul className="-mb-px flex gap-6 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm whitespace-nowrap transition ${
                  active
                    ? "border-zinc-900 font-medium text-zinc-900"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{tab.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
