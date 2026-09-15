import type { Metadata } from "next";
import { TeamTable } from "@/components/team/team-table";
import { requireTenantPermission } from "@/lib/auth/session";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  setTeamMemberPasswordAction,
  updateTeamMemberRolesAction,
} from "@/lib/team/actions";
import { getTeam } from "@/lib/team/core";
import { actorFromSession, getMemberFlags, getRoleOptions } from "@/lib/team/view";

export const metadata: Metadata = {
  title: "Equipo — CellFix",
};

export default async function TeamPage() {
  const session = await requireTenantPermission("users.manage");
  const actor = actorFromSession(session);
  const team = await getTeam(session.tenant.id);

  return (
    <TeamTable
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
          <p className="mt-1 text-sm text-zinc-600">Personas que trabajan en {session.tenant.name} y sus roles.</p>
        </div>
      }
      team={team}
      roleOptions={getRoleOptions(team, actor)}
      addAction={addTeamMemberAction}
      rows={team.members.map((member) => ({
        member,
        ...getMemberFlags(team, actor, member),
        updateRolesAction: updateTeamMemberRolesAction.bind(null, member.id),
        setPasswordAction: setTeamMemberPasswordAction.bind(null, member.id),
        removeAction: removeTeamMemberAction.bind(null, member.id),
      }))}
    />
  );
}
