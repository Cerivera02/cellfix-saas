"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/settings/ticket", label: "Ticket" },
  { href: "/dashboard/settings/orders", label: "Órdenes" },
  { href: "/dashboard/settings/warranties", label: "Garantías" },
  { href: "/dashboard/settings/accounts", label: "Cuentas bancarias" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de configuración" className="mb-6 border-b border-zinc-200 print:hidden">
      <ul className="-mb-px flex gap-6 overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block border-b-2 px-1 pb-3 text-sm whitespace-nowrap transition ${
                  active
                    ? "border-zinc-900 font-medium text-zinc-900"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
