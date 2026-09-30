import type { Metadata } from "next";
import { RolesManager } from "@/components/team/roles-manager";
import { requireTenantPermission } from "@/lib/auth/session";
import { MODULES, MODULE_KEYS, hasModule } from "@/lib/modules";
import { createTeamRoleAction, deleteTeamRoleAction, updateTeamRoleAction } from "@/lib/team/actions";
import { getTeam } from "@/lib/team/core";
import { actorFromSession, getDisabledPermissions } from "@/lib/team/view";

export const metadata: Metadata = {
  title: "Roles — CellFix",
};

export default async function RolesPage() {
  const session = await requireTenantPermission("roles.manage");
  const actor = actorFromSession(session);
  const team = await getTeam(session.tenant.id);
  // Los permisos de módulos apagados no se ofrecen al armar roles.
  const hiddenPermissions = MODULE_KEYS.filter((key) => !hasModule(session.modules, key)).flatMap(
    (key) => MODULES[key].permissions,
  );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
      <p className="mt-1 text-sm text-zinc-600">Qué puede ver y hacer cada persona en {session.tenant.name}.</p>

      <div className="mt-8">
        <RolesManager
          createAction={createTeamRoleAction}
          disabledPermissions={getDisabledPermissions(actor)}
          hiddenPermissions={hiddenPermissions}
          rows={team.customRoles.map((role) => ({
            role,
            updateAction: updateTeamRoleAction.bind(null, role.id),
            deleteAction: deleteTeamRoleAction.bind(null, role.id),
          }))}
        />
      </div>
    </>
  );
}
