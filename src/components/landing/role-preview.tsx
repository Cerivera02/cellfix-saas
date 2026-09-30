"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CUSTOMER_ACCESS_PERMISSIONS } from "@/lib/customers/access";
import { ORDER_ACCESS_PERMISSIONS, canSeeOrderPrices } from "@/lib/orders/labels";
import { SYSTEM_ROLES, type Permission } from "@/lib/permissions";

type PreviewRole = "owner" | "reception" | "technician";

const ROLES: PreviewRole[] = ["owner", "reception", "technician"];

// Menú del panel y el permiso que lo muestra (igual que en src/app/dashboard/layout.tsx).
const NAV: { label: string; visible: (can: (p: Permission) => boolean) => boolean }[] = [
  { label: "Inicio", visible: () => true },
  { label: "Reparaciones", visible: (can) => ORDER_ACCESS_PERMISSIONS.some(can) },
  { label: "Caja", visible: (can) => can("sales.create") || can("cash.view") || can("cash.operate") },
  { label: "Clientes", visible: (can) => CUSTOMER_ACCESS_PERMISSIONS.some(can) },
  { label: "Inventario", visible: (can) => can("inventory.view") || can("purchases.manage") },
  { label: "Equipo", visible: (can) => can("users.manage") || can("roles.manage") },
];

const MONEY = [
  { label: "Presupuesto", value: "$1,850.00" },
  { label: "Anticipo", value: "$500.00" },
  { label: "Saldo", value: "$1,350.00" },
];

export function RolePreview() {
  const [role, setRole] = useState<PreviewRole>("technician");
  const baseId = useId();
  const permissions = SYSTEM_ROLES[role].permissions;
  const can = (permission: Permission) => permissions.includes(permission);
  const seesPrices = canSeeOrderPrices(permissions);

  // Flechas para moverse entre pestañas, como pide el patrón de tabs.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = ROLES[(ROLES.indexOf(role) + step + ROLES.length) % ROLES.length];
    setRole(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Rol" className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1">
        {ROLES.map((key) => {
          const selected = key === role;
          return (
            <button
              key={key}
              id={`${baseId}-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setRole(key)}
              onKeyDown={onKeyDown}
              className={`rounded-md px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                selected ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {SYSTEM_ROLES[key].label}
            </button>
          );
        })}
      </div>
      <p className="mt-4 min-h-12 max-w-xl text-sm leading-relaxed text-zinc-600">{SYSTEM_ROLES[role].description}</p>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${role}`}
        className="mt-6 grid overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 sm:grid-cols-[11rem_1fr]"
      >
        <nav aria-label="Menú de ejemplo" className="border-b border-zinc-100 bg-zinc-50 p-3 sm:border-r sm:border-b-0">
          <ul className="flex flex-wrap gap-1 sm:flex-col">
            {NAV.map((item) => {
              const visible = item.visible(can);
              return (
                <li
                  key={item.label}
                  className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    visible ? "text-zinc-800" : "text-zinc-300 line-through decoration-zinc-300"
                  } ${item.label === "Reparaciones" ? "bg-white font-medium shadow-sm ring-1 ring-zinc-200" : ""}`}
                >
                  {item.label}
                  {!visible && <span className="sr-only"> (sin acceso)</span>}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-folio text-sm text-zinc-500">#1042</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Listo para entregar
            </span>
          </div>
          <p className="mt-1 font-medium text-zinc-900">iPhone 13 · Pantalla estrellada</p>
          <p className="mt-1 text-sm text-zinc-600">Se cambió el módulo de pantalla. Táctil y Face ID funcionando.</p>

          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-100 pt-4">
            {MONEY.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-zinc-500">{item.label}</dt>
                <dd className="mt-1 font-folio text-sm text-zinc-900">
                  {seesPrices ? (
                    item.value
                  ) : (
                    <>
                      <span aria-hidden="true" className="inline-block h-3.5 w-16 rounded-sm bg-zinc-200 align-middle" />
                      <span className="sr-only">Oculto</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            {can("payments.collect") && (
              <span className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white">Cobrar $1,350.00</span>
            )}
            {can("orders.deliver") && (
              <span className="rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700">
                Dar salida
              </span>
            )}
            {!can("orders.deliver") && can("repairs.work") && (
              <span className="rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700">
                Regresar a reparación
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
