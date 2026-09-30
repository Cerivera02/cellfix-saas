import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmingPayment } from "@/components/billing/confirming-payment";
import { PaymentsTable } from "@/components/billing/payments-table";
import { ChangePlanForm, CheckoutPlanForm } from "@/components/billing/plan-form";
import { ActionButton } from "@/components/ui/action-button";
import { secondaryButtonClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { BILLING_PATH, canManageBilling, requireTenantSession } from "@/lib/auth/session";
import { type TenantAccess } from "@/lib/billing/access";
import {
  openBillingPortalAction,
  previewModulesAction,
  startCheckoutAction,
  updateModulesAction,
} from "@/lib/billing/actions";
import { formatCents } from "@/lib/billing/format";
import { listTenantPaymentsWithBackfill } from "@/lib/billing/payments";
import { getPublicPricing } from "@/lib/billing/pricing";
import { checkoutTrial } from "@/lib/billing/rules";
import { isStripeConfigured } from "@/lib/billing/stripe";
import {
  getLiveSubscriptionDetails,
  getTenantSubscription,
  hasLiveSubscription,
  syncCheckoutSessionById,
  type LiveSubscriptionDetails,
} from "@/lib/billing/subscription";
import { MODULES, MODULE_KEYS } from "@/lib/modules";

export const metadata: Metadata = {
  title: "Suscripción — CellFix",
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
};

function days(count: number | null) {
  return count === 1 ? "1 día" : `${count ?? 0} días`;
}

// Qué pasa hoy con la cuenta y qué sigue, en una o dos frases.
function statusText(access: TenantAccess, status: string, hasSubscription: boolean, live: LiveSubscriptionDetails | null) {
  if (live?.endsAt) {
    return {
      title: `Tu suscripción termina el ${dateFormatter.format(live.endsAt)}`,
      detail: "Hasta esa fecha todo sigue funcionando y no se te volverá a cobrar. Puedes reactivarla desde Administrar pago.",
    };
  }
  if (live?.trialEndsAt) {
    return {
      title: "Suscripción activa",
      detail: `Tu prueba sigue hasta el ${dateFormatter.format(live.trialEndsAt)}; el primer cobro será ese día.`,
    };
  }

  switch (access.state) {
    case "trial":
      return {
        title: `Prueba gratuita: quedan ${days(access.daysLeft)}`,
        detail: access.trialEndsAt
          ? `Tienes todos los módulos hasta el ${dateFormatter.format(access.trialEndsAt)}. Si pagas antes, no se te cobra hasta que termine la prueba.`
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
        detail: `Actualiza tu forma de pago en Administrar pago. Si no se cobra en ${days(access.daysLeft)}, se pausa el acceso.`,
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
      return { title: "Suscripción activa", detail: hasSubscription ? "Se cobra automáticamente cada mes." : "Tu taller tiene acceso completo." };
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-900">{children}</dd>
    </div>
  );
}

function PaymentNotice({ kind, live }: { kind: string | undefined; live: LiveSubscriptionDetails | null }) {
  const success = "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";
  const neutral = "rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700";

  if (kind === "cancelado") {
    return <p className={neutral}>No se completó el pago y no se hizo ningún cobro. Puedes intentarlo de nuevo cuando quieras.</p>;
  }
  if (kind === "duplicado") {
    return <p className={neutral}>Tu taller ya tenía una suscripción activa, así que no se creó otra.</p>;
  }
  if (kind === "ok" || (kind === "confirmando" && live)) {
    return (
      <p className={success}>
        {live?.trialEndsAt
          ? `Listo, tu suscripción quedó activa. Tu prueba sigue hasta el ${dateFormatter.format(live.trialEndsAt)}; el primer cobro será ese día.`
          : "Listo, recibimos tu pago. Tu suscripción está activa."}
      </p>
    );
  }
  if (kind === "confirmando") return <ConfirmingPayment />;
  return null;
}

export default async function SubscriptionPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Sigue abierta con el taller bloqueado: es donde se reactiva.
  const session = await requireTenantSession({ allowLocked: true });
  const canManage = canManageBilling(session);

  // Al volver de Stripe se confirma el pago en el momento, sin esperar al webhook. La sesión de
  // checkout debe ser de este taller y estar pagada (o en prueba) para mostrarse como éxito.
  const searchParams = await props.searchParams;
  const checkoutSessionId = typeof searchParams.session_id === "string" ? searchParams.session_id : null;
  if (canManage && searchParams.pagado === "1" && checkoutSessionId) {
    const outcome = await syncCheckoutSessionById(session.tenant.id, checkoutSessionId);
    const notice = { confirmed: "ok", pending: "confirmando", duplicate: "duplicado", invalid: null }[outcome];
    // Se vuelve a cargar sin el id para leer el estado nuevo (la sesión se memoiza por petición).
    redirect(notice ? `${BILLING_PATH}?pagado=${notice}` : BILLING_PATH);
  }
  const notice = searchParams.cancelado === "1" ? "cancelado" : typeof searchParams.pagado === "string" ? searchParams.pagado : undefined;

  const { access, subscriptionStatus } = session;
  const subscription = await getTenantSubscription(session.tenant.id);
  const hasSubscription = hasLiveSubscription({ status: subscriptionStatus, stripeSubscriptionId: subscription.stripeSubscriptionId });

  if (!canManage) {
    const status = statusText(access, subscriptionStatus, hasSubscription, null);
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

  const stripeReady = isStripeConfigured();
  const [pricing, payments, live] = await Promise.all([
    getPublicPricing(),
    listTenantPaymentsWithBackfill(session.tenant.id, Boolean(subscription.stripeCustomerId)),
    hasSubscription ? getLiveSubscriptionDetails(session.tenant.id) : Promise.resolve(null),
  ]);
  const status = statusText(access, subscriptionStatus, hasSubscription, live);
  const planPricing = {
    currency: pricing.currency,
    baseCents: pricing.baseCents,
    modules: pricing.modules.map(({ key, priceCents }) => ({ key, priceCents })),
  };
  // Sin suscripción: en la prueba tiene todos los módulos y parte de ahí.
  // Con suscripción: de lo que Stripe cobra (en la prueba de Stripe el taller usa todos, pero paga estos).
  const defaultModules = hasSubscription
    ? (live?.billedModules ?? session.modules)
    : subscriptionStatus === "trialing"
      ? [...MODULE_KEYS]
      : session.modules;
  const trial = checkoutTrial({ status: subscriptionStatus, trialEndsAt: subscription.trialEndsAt });
  const money = (cents: number, currency: string) => formatCents(cents, currency);

  return (
    <>
      <PageHeader title="Suscripción" description="Elige los módulos de tu taller y paga cada mes con tarjeta." />

      <div className="flex max-w-2xl flex-col gap-4">
        <PaymentNotice kind={notice} live={live} />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="font-medium">{status.title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{status.detail}</p>

          {live && (
            <dl className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
              <Row label="Módulos">
                {["Plan base", ...live.billedModules.map((key) => MODULES[key].label)].join(", ")}
              </Row>
              <Row label="Total mensual">
                <span className="tabular-nums">{money(live.monthlyTotalCents, live.currency)}</span>
              </Row>
              {live.nextCharge && (
                <Row label="Próximo cobro">
                  {dateFormatter.format(live.nextCharge.at)} ·{" "}
                  <span className="tabular-nums">{money(live.nextCharge.amountCents, live.currency)}</span>
                </Row>
              )}
              {live.paymentMethod && (
                <Row label="Tarjeta">
                  {CARD_BRANDS[live.paymentMethod.brand] ?? live.paymentMethod.brand} terminada en {live.paymentMethod.last4}
                </Row>
              )}
            </dl>
          )}
          {live && !live.endsAt && <p className="mt-3 text-xs text-zinc-500">Se cobra automáticamente cada mes.</p>}

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
          <h2 className="font-medium">{hasSubscription ? "Cambiar módulos" : "Elige tu plan"}</h2>
          <p className="mt-1 mb-5 text-sm text-zinc-500">
            {hasSubscription
              ? "Agrega o quita módulos cuando quieras. Antes de confirmar verás cuánto cambia tu próxima factura."
              : "Paga solo por lo que usas. Puedes cambiar los módulos después."}
          </p>
          {!stripeReady && (
            <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Los pagos con tarjeta aún no están configurados. Escríbenos para activar tu suscripción.
            </p>
          )}
          {hasSubscription ? (
            <ChangePlanForm
              pricing={planPricing}
              defaultModules={defaultModules}
              disabled={!stripeReady || Boolean(live?.endsAt)}
              previewAction={previewModulesAction}
              updateAction={updateModulesAction}
            />
          ) : (
            <CheckoutPlanForm
              pricing={planPricing}
              defaultModules={defaultModules}
              firstChargeAt={trial ? trial.firstChargeAt.toISOString() : null}
              disabled={!stripeReady}
              action={startCheckoutAction}
            />
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Historial de pagos</h2>
          <PaymentsTable payments={payments} />
        </section>
      </div>
    </>
  );
}
