import { describeAccess, type AccessState, type SubscriptionStatus, type TenantAccess } from "@/lib/billing/access";

const STYLES: Record<AccessState, string> = {
  trial: "bg-sky-50 text-sky-700",
  grace: "bg-amber-50 text-amber-700",
  past_due: "bg-amber-50 text-amber-700",
  active: "bg-zinc-100 text-zinc-700",
  locked: "bg-red-50 text-red-700",
};

export function SubscriptionBadge({ access, status }: { access: TenantAccess; status: SubscriptionStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STYLES[access.state]}`}>
      {describeAccess(access, status)}
    </span>
  );
}
