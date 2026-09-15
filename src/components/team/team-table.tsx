import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { MemberActions } from "@/components/team/member-actions";
import { RoleBadges } from "@/components/team/role-badges";
import type { FormState } from "@/lib/form-state";
import type { Team, TeamMember } from "@/lib/team/core";
import type { RoleOptions } from "@/lib/team/view";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export type TeamRow = {
  member: TeamMember;
  canEditRoles: boolean;
  canChangePassword: boolean;
  canRemove: boolean;
  updateRolesAction: Action;
  setPasswordAction: Action;
  removeAction: Action;
};

// Tabla del equipo compartida por el panel administrativo y el dashboard del taller.
export function TeamTable({
  header,
  team,
  roleOptions,
  addAction,
  rows,
}: {
  header: React.ReactNode;
  team: Team;
  roleOptions: RoleOptions;
  addAction: Action;
  rows: TeamRow[];
}) {
  const customRoleNames = new Map(team.customRoles.map((role) => [role.id, role.name]));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        <AddMemberDialog action={addAction} roleOptions={roleOptions} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Nombre</th>
              <th className="px-5 py-3 font-medium">Roles</th>
              <th className="px-5 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.member.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-zinc-900">{row.member.name}</p>
                  <p className="text-xs text-zinc-500">{row.member.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  <RoleBadges
                    systemRoles={row.member.systemRoles}
                    customRoles={row.member.customRoleIds.map((id) => ({ id, name: customRoleNames.get(id) ?? "Rol" }))}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <MemberActions
                    memberName={row.member.name}
                    roleOptions={roleOptions}
                    systemRoles={row.member.systemRoles}
                    customRoles={row.member.customRoleIds}
                    canEditRoles={row.canEditRoles}
                    canChangePassword={row.canChangePassword}
                    canRemove={row.canRemove}
                    updateRolesAction={row.updateRolesAction}
                    setPasswordAction={row.setPasswordAction}
                    removeAction={row.removeAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {team.ownerCount <= 1 && (
        <p className="mt-3 text-xs text-zinc-500">
          El único propietario no se puede quitar; asigna el rol Propietario a otra persona antes.
        </p>
      )}
    </section>
  );
}
