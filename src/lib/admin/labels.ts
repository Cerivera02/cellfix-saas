import type { TenantStatus } from "@/lib/admin/tenants";

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  active: "Activo",
  suspended: "Suspendido",
};
