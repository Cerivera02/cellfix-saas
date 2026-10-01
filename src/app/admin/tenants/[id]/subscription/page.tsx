import { notFound } from "next/navigation";
import { ExtendTrialForm } from "@/components/admin/extend-trial-form";
import { PaymentsTable } from "@/components/billing/payments-table";
import { ActionButton } from "@/components/ui/action-button";
import { secondaryButtonClass } from "@/components/ui/form";
import { extendTrialAction, markTenantActiveAction, syncTenantPaymentsAction } from "@/lib/admin/actions";
import { getTenant } from "@/lib/admin/tenants";
import { describeAccess } from "@/lib/billing/access";
import { listTenantPayments } from "@/lib/billing/payments";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" });

const STATUS_LABELS = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm break-all text-zinc-900">{children}</dd>
    </div>
  );
}

export default async function TenantSubscriptionPage(props: PageProps<"/admin/tenants/[id]/subscription">) {
  const { id } = await props.params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const { subscription } = tenant;
  const payments = await listTenantPayments(tenant.id);
  const { access } = subscription;
  const paysWithStripe =
    Boolean(subscription.stripeSubscriptionId) && (subscription.status === "active" || subscription.status === "past_due");
  const format = (date: Date | null) => (date ? dateFormatter.format(date) : "—");

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-medium">{describeAccess(access, subscription.status)}</h2>
        <dl className="mt-3 divide-y divide-zinc-100">
          <Row label="Estado en la base">{STATUS_LABELS[subscription.status]}</Row>
          <Row label="Fin de la prueba">{format(subscription.trialEndsAt)}</Row>
          <Row label="Fin de la gracia">{format(access.graceEndsAt)}</Row>
          <Row label="Pagado hasta">{format(subscription.currentPeriodEnd)}</Row>
          <Row label="Cliente de Stripe">
            <span className="font-mono">{subscription.stripeCustomerId ?? "—"}</span>
          </Row>
          <Row label="Suscripción de Stripe">
            <span className="font-mono">{subscription.stripeSubscriptionId ?? "—"}</span>
          </Row>
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-medium">Extender la prueba</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-500">
          {paysWithStripe
            ? "Este taller paga con Stripe: su acceso lo controla la suscripción."
            : "Suma días desde el fin de la prueba, o desde hoy si ya terminó. Desbloquea al taller si estaba bloqueado."}
        </p>
        {!paysWithStripe && <ExtendTrialForm action={extendTrialAction.bind(null, tenant.id)} />}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-medium">Activar sin Stripe</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-500">
          Para talleres que pagan por fuera (transferencia, efectivo). Queda activo sin fecha de fin hasta que lo
          cambies. Si tiene una suscripción de Stripe, sus avisos pueden volver a cambiar el estado.
        </p>
        <ActionButton
          action={markTenantActiveAction.bind(null, tenant.id)}
          label="Marcar como activa"
          pendingLabel="Activando…"
          confirm={`¿Activar la suscripción de ${tenant.name} sin cobro en Stripe?`}
          confirmTone="default"
          className={secondaryButtonClass}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Historial de pagos</h2>
            <p className="mt-1 text-sm text-zinc-500">Facturas de Stripe con sus ids de factura, pago y cargo.</p>
          </div>
          {subscription.stripeCustomerId && (
            <ActionButton
              action={syncTenantPaymentsAction.bind(null, tenant.id)}
              label="Sincronizar pagos"
              pendingLabel="Sincronizando…"
              className={secondaryButtonClass}
            />
          )}
        </div>
        <PaymentsTable payments={payments} showStripeIds />
      </section>
    </div>
  );
}
