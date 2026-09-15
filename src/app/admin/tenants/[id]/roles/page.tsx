import { notFound } from "next/navigation";
import { RolesManager } from "@/components/team/roles-manager";
import { createCustomRoleAction, deleteCustomRoleAction, updateCustomRoleAction } from "@/lib/admin/actions";
import { getTenant } from "@/lib/admin/tenants";

export default async function TenantRolesPage(props: PageProps<"/admin/tenants/[id]/roles">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  return (
    <RolesManager
      createAction={createCustomRoleAction.bind(null, tenant.id)}
      disabledPermissions={[]}
      rows={tenant.team.customRoles.map((role) => ({
        role,
        updateAction: updateCustomRoleAction.bind(null, tenant.id, role.id),
        deleteAction: deleteCustomRoleAction.bind(null, tenant.id, role.id),
      }))}
    />
  );
}
