import { notFound } from "next/navigation";
import { RolesManager } from "@/components/team/roles-manager";
import { createCustomRoleAction, deleteCustomRoleAction, updateCustomRoleAction } from "@/lib/admin/actions";
import { getTenant } from "@/lib/admin/tenants";
import { MODULES, MODULE_KEYS, hasModule } from "@/lib/modules";

export default async function TenantRolesPage(props: PageProps<"/admin/tenants/[id]/roles">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();
  // Los permisos de módulos apagados no se ofrecen al armar roles.
  const hiddenPermissions = MODULE_KEYS.filter((key) => !hasModule(tenant.modules, key)).flatMap(
    (key) => MODULES[key].permissions,
  );

  return (
    <RolesManager
      createAction={createCustomRoleAction.bind(null, tenant.id)}
      disabledPermissions={[]}
      hiddenPermissions={hiddenPermissions}
      rows={tenant.team.customRoles.map((role) => ({
        role,
        updateAction: updateCustomRoleAction.bind(null, tenant.id, role.id),
        deleteAction: deleteCustomRoleAction.bind(null, tenant.id, role.id),
      }))}
    />
  );
}
