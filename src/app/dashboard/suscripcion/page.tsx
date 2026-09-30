import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentsTable } from "@/components/billing/payments-table";
import { PlanForm } from "@/components/billing/plan-form";
import { ActionButton } from "@/components/ui/action-button";
import { secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { BILLING_PATH, canManageBilling, requireTenantSession } from "@/lib/auth/session";
import { type TenantAccess } from "@/lib/billing/access";
import { openBillingPortalAction, startCheckoutAction, updateModulesAction } from "@/lib/billing/actions";
import { listTenantPaymentsWithBackfill } from "@/lib/billing/payments";
import { getPublicPricing } from "@/lib/billing/pricing";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getTenantSubscription, hasLiveSubscription, syncCheckoutSessionById } from "@/lib/billing/subscription";
import { MODULE_KEYS } from "@/lib/modules";

export const metadata: Metadata = {
  title: "Suscripción — CellFix",
};

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "long" });

function days(count: number | null) {
  return count === 1 ? "1 día" : `${count ?? 0} días`;
}

// Qué pasa hoy con la cuenta y qué sigue, en una o dos frases.
function statusText(access: TenantAccess, status: string, hasSubscription: boolean) {
  switch (access.state) {
    case "trial":
      return {
        title: `Prueba gratuita: quedan ${days(access.daysLeft)}`,
        detail: access.trialEndsAt
          ? `Tienes todos los módulos hasta el ${dateFormatter.format(access.trialEndsAt)}. Si pagas antes, el primer cobro se hace al terminar la prueba.`
          : "Tienes todos los módulos activos.",
      };
    case "grace":
      return {
        title: "Tu prueba gratuita terminó",
        detail: `Puedes seguir usando CellFix ${days(access.daysLeft)} más. Después se pausa el acceso hasta que actives tu suscripción.`,
      };
    case "past_due":
      return {
        title: "No pudimos cobrar tu suscripción",
        detail: `Actualiza tu forma de pago. Si no se cobra en ${days(access.daysLeft)}, se pausa el acceso.`,
      };
    case "locked":
      return {
        title: "El acceso está pausado",
        detail: hasSubscription
          ? "Tu suscripción no está al corriente. Actualiza el pago o vuelve a suscribirte para reactivar el sistema; tus datos siguen guardados."
          : "La prueba gratuita terminó. Elige tus módulos y activa tu suscripción para volver a usar el sistema; tus datos siguen guardados.",
      };
    case "active":
      if (status === "canceled") {
        return {
          title: "Suscripción cancelada",
          detail: access.paidUntil
            ? `Puedes usar CellFix hasta el ${dateFormatter.format(access.paidUntil)}. Suscríbete de nuevo para no perder el acceso.`
            : "Suscríbete de nuevo para no perder el acceso.",
        };
      }
      return {
        title: "Suscripción activa",
        detail: access.paidUntil
          ? `Próximo cobro el ${dateFormatter.format(access.paidUntil)}.`
          : "Tu taller tiene acceso completo.",
      };
  }
}

export default async function SubscriptionPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Sigue abierta con el taller bloqueado: es donde se reactiva.
  const session = await requireTenantSession({ allowLocked: true });
  const canManage = canManageBilling(session);

  // Al volver de Stripe se confirma el pago en el momento, sin esperar al webhook.
  const searchParams = await props.searchParams;
  const checkoutSessionId = typeof searchParams.session_id === "string" ? searchParams.session_id : null;
  const returnedFromPayment = searchParams.pagado === "1";
  if (canManage && returnedFromPayment && checkoutSessionId) {
    await syncCheckoutSessionById(session.tenant.id, checkoutSessionId);
    // Se vuelve a cargar sin el id para leer el estado nuevo (la sesión se memoiza por petición).
    redirect(`${BILLING_PATH}?pagado=1`);
  }

  const { access, subscriptionStatus } = session;
  const subscription = await getTenantSubscription(session.tenant.id);
  const live = hasLiveSubscription({ status: subscriptionStatus, stripeSubscriptionId: subscription.stripeSubscriptionId });
  const status = statusText(access, subscriptionStatus, Boolean(subscription.stripeSubscriptionId));

  if (!canManage) {
    return (
      <>
        <PageHeader title="Suscripción" />
        <section className="max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="font-medium">{status.title}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {access.state === "locked"
              ? "Pide al propietario del taller que active la suscripción para volver a usar el sistema."
              : "La suscripción la administra el propietario del taller."}
          </p>
        </section>
      </>
    );
  }

  const [pricing, payments] = await Promise.all([
    getPublicPricing(),
    listTenantPaymentsWithBackfill(session.tenant.id, Boolean(subscription.stripeCustomerId)),
  ]);
  const stripeReady = isStripeConfigured();
  // En la prueba tiene todos los módulos: parte de ahí. Con suscripción, de lo que ya paga.
  const defaultModules = subscriptionStatus === "trialing" ? [...MODULE_KEYS] : session.modules;

  return (
    <>
      <PageHeader title="Suscripción" description="Elige los módulos de tu taller y paga cada mes con tarjeta." />

      <div className="flex max-w-2xl flex-col gap-4">
        {returnedFromPayment && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {live
              ? "Listo, recibimos tu pago. Tu suscripción está activa."
              : "Recibimos tu pago. Tu suscripción se activará en unos momentos; recarga la página si no cambia."}
          </p>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="font-medium">{status.title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{status.detail}</p>
          {subscription.stripeSubscriptionId && stripeReady && (
            <div className="mt-4">
              <ActionButton
                action={openBillingPortalAction}
                label="Administrar pago"
                pendingLabel="Abriendo…"
                className={secondaryButtonClass}
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="font-medium">{live ? "Tu plan" : "Elige tu plan"}</h2>
          <p className="mt-1 mb-5 text-sm text-zinc-500">
            {live
              ? "Agrega o quita módulos cuando quieras. Stripe ajusta la diferencia por los días que faltan en tu próxima factura."
              : "Paga solo por lo que usas. Puedes cambiar los módulos después."}
          </p>
          {!stripeReady && (
            <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Los pagos con tarjeta aún no están configurados. Escríbenos para activar tu suscripción.
            </p>
          )}
          <PlanForm
            pricing={{
              currency: pricing.currency,
              baseCents: pricing.baseCents,
              modules: pricing.modules.map(({ key, priceCents }) => ({ key, priceCents })),
            }}
            defaultModules={defaultModules}
            mode={live ? "update" : "checkout"}
            disabled={!stripeReady}
            action={live ? updateModulesAction : startCheckoutAction}
          />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Historial de pagos</h2>
          <PaymentsTable payments={payments} />
        </section>
      </div>
    </>
  );
}
