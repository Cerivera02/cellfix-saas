import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenantPermission } from "@/lib/auth/session";

// Configuración del taller: solo con "Configuración del taller". Cada página lo vuelve a verificar.
export default async function SettingsLayout({ children }: LayoutProps<"/dashboard/settings">) {
  await requireTenantPermission("settings.manage");

  return (
    <>
      <PageHeader title="Configuración" />
      <SettingsTabs />
      {children}
    </>
  );
}
