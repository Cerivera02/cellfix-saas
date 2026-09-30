"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { primaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";

// Lo que todo taller tiene siempre, sin importar sus módulos.
const BASE_MODULES = [
  { label: "Reparaciones", description: "Recepción de equipos, trabajo del técnico, cobros y entrega." },
  { label: "Clientes", description: "Datos de contacto y facturación, e historial de órdenes." },
  { label: "Equipo", description: "Usuarios, roles y permisos." },
];

const rowClass = "flex items-start gap-3 px-4 py-3";

export function TenantModulesForm({
  defaultModules,
  action,
}: {
  defaultModules: ModuleKey[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<ModuleKey[]>(defaultModules);

  // Al apagar un módulo se apagan también los que dependen de él (Compras sin Inventario).
  const toggle = (key: ModuleKey, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...current, key]
        : current.filter((other) => other !== key && !MODULES[other].requires.includes(key)),
    );

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-zinc-700">Siempre activos</legend>
        <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {BASE_MODULES.map((base) => (
            <li key={base.label} className={rowClass}>
              <input
                type="checkbox"
                checked
                readOnly
                disabled
                aria-label={base.label}
                className="mt-0.5 size-4 shrink-0 accent-zinc-900"
              />
              <div>
                <p className="text-sm font-medium text-zinc-500">{base.label}</p>
                <p className="text-xs text-zinc-500">{base.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-zinc-700">Opcionales</legend>
        <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {MODULE_KEYS.map((key) => {
            const info = MODULES[key];
            const blocked = info.requires.some((required) => !selected.includes(required));
            return (
              <li key={key}>
                <label
                  className={`${rowClass} ${blocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-zinc-50"}`}
                >
                  <input
                    type="checkbox"
                    name="modules"
                    value={key}
                    checked={selected.includes(key) && !blocked}
                    disabled={blocked}
                    onChange={(event) => toggle(key, event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-zinc-900"
                  />
                  <span>
                    <span className={`block text-sm font-medium ${blocked ? "text-zinc-400" : "text-zinc-900"}`}>
                      {info.label}
                    </span>
                    <span className="block text-xs text-zinc-500">{info.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={`self-start ${primaryButtonClass}`}>
        {pending ? "Guardando…" : "Guardar módulos"}
      </button>
    </form>
  );
}
