import { TENANT_STATUS_LABELS } from "@/lib/admin/labels";
import type { TenantStatus } from "@/lib/admin/tenants";

const STYLES: Record<TenantStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  suspended: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {TENANT_STATUS_LABELS[status]}
    </span>
  );
}
