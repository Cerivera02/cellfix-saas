import { DeleteRoleButton } from "@/components/team/delete-role-button";
import { RoleDialogButton } from "@/components/team/role-dialog-button";
import type { FormState } from "@/lib/form-state";
import { PERMISSION_LABELS, SYSTEM_ROLES, SYSTEM_ROLE_KEYS, type Permission } from "@/lib/permissions";
import type { CustomRole } from "@/lib/team/core";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export type CustomRoleRow = { role: CustomRole; updateAction: Action; deleteAction: Action };

function PermissionChips({ permissions }: { permissions: readonly Permission[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {permissions.map((permission) => (
        <li key={permission} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
          {PERMISSION_LABELS[permission]}
        </li>
      ))}
    </ul>
  );
}

// Roles Custom del taller y referencia de los predefinidos. Compartido por el
// panel administrativo y el dashboard del taller.
export function RolesManager({
  createAction,
  rows,
  disabledPermissions,
}: {
  createAction: Action;
  rows: CustomRoleRow[];
  disabledPermissions: Permission[];
}) {
  return (
    <div className="flex flex-col gap-12">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Roles Custom</h2>
            <p className="mt-1 text-sm text-zinc-500">Combina permisos para crear roles a la medida del taller.</p>
          </div>
          <RoleDialogButton
            label="Nuevo rol"
            title="Nuevo rol Custom"
            description="Elige qué podrán ver o hacer quienes tengan este rol."
            action={createAction}
            disabledPermissions={disabledPermissions}
            submitLabel="Crear rol"
          />
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
            <p className="font-medium">Aún no hay roles Custom</p>
            <p className="mt-1 text-sm text-zinc-500">
              Los roles predefinidos cubren lo habitual; crea uno si necesitas otra combinación.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {rows.map(({ role, updateAction, deleteAction }) => (
              <li key={role.id} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">{role.name}</p>
                    {role.description && <p className="mt-0.5 text-sm text-zinc-500">{role.description}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {role.memberCount === 1 ? "1 usuario" : `${role.memberCount} usuarios`}
                  </span>
                </div>

                <div className="mb-4">
                  <PermissionChips permissions={role.permissions} />
                </div>

                <div className="mt-auto flex items-start justify-end gap-1 border-t border-zinc-100 pt-3">
                  <RoleDialogButton
                    label="Editar"
                    variant="ghost"
                    title={`Editar ${role.name}`}
                    description="Los cambios aplican de inmediato a quienes tengan este rol."
                    action={updateAction}
                    defaults={{ name: role.name, description: role.description, permissions: role.permissions }}
                    disabledPermissions={disabledPermissions}
                    submitLabel="Guardar"
                  />
                  <DeleteRoleButton roleName={role.name} action={deleteAction} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Roles predefinidos</h2>
        <p className="mt-1 text-sm text-zinc-500">Disponibles en todos los talleres; no se pueden modificar.</p>

        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SYSTEM_ROLE_KEYS.map((key) => (
            <li key={key} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="font-medium text-zinc-900">{SYSTEM_ROLES[key].label}</p>
              <p className="mt-0.5 text-sm text-zinc-500">{SYSTEM_ROLES[key].description}</p>
              {key === "owner" ? (
                <p className="mt-3 text-xs text-zinc-600">Todos los permisos</p>
              ) : (
                <PermissionChips permissions={SYSTEM_ROLES[key].permissions} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
