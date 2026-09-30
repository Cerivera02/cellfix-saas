import type { Metadata } from "next";
import { RepairSettingsForm } from "@/components/settings/repair-settings-form";
import { requireTenantPermission } from "@/lib/auth/session";
import { hasModule } from "@/lib/modules";
import { updateRepairSettingsAction } from "@/lib/settings/actions";
import { getRepairSettings } from "@/lib/settings/core";

export const metadata: Metadata = {
  title: "Órdenes — Configuración — CellFix",
};

export default async function OrderSettingsPage() {
  const session = await requireTenantPermission("settings.manage");
  const settings = await getRepairSettings(session.tenant.id);

  return (
    <RepairSettingsForm
      action={updateRepairSettingsAction}
      defaults={settings}
      hasTracking={hasModule(session.modules, "tracking")}
    />
  );
}
