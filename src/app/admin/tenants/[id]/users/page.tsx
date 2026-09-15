import { notFound } from "next/navigation";
import { TeamTable } from "@/components/team/team-table";
import {
  addMemberAction,
  removeMemberAction,
  setMemberPasswordAction,
  updateMemberRolesAction,
} from "@/lib/admin/actions";
import { getTenant } from "@/lib/admin/tenants";
import { PLATFORM_ACTOR } from "@/lib/team/core";
import { getMemberFlags, getRoleOptions } from "@/lib/team/view";

export default async function TenantUsersPage(props: PageProps<"/admin/tenants/[id]/users">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const { team } = tenant;

  return (
    <TeamTable
      header={
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Usuarios</h2>
          <p className="mt-1 text-sm text-zinc-500">Personas que pueden iniciar sesión en este taller.</p>
        </div>
      }
      team={team}
      roleOptions={getRoleOptions(team, PLATFORM_ACTOR)}
      addAction={addMemberAction.bind(null, tenant.id)}
      rows={team.members.map((member) => ({
        member,
        ...getMemberFlags(team, PLATFORM_ACTOR, member),
        updateRolesAction: updateMemberRolesAction.bind(null, tenant.id, member.id),
        setPasswordAction: setMemberPasswordAction.bind(null, tenant.id, member.id),
        removeAction: removeMemberAction.bind(null, tenant.id, member.id),
      }))}
    />
  );
}
