import type { Metadata } from "next";
import { cache } from "react";
import { brandFonts } from "@/app/fonts";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders/labels";
import { toCents } from "@/lib/cash/money";
import { getPublicTracking, type PublicTracking } from "@/lib/tracking/core";
import { describeWarrantyRemaining, getWarrantyStatus } from "@/lib/warranties/status";

// Página pública de seguimiento que abre el cliente con el enlace o el QR del comprobante.
// No requiere sesión: la autoriza el token de la orden.

const loadTracking = cache(getPublicTracking);

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

export async function generateMetadata(props: PageProps<"/s/[slug]/[token]">): Promise<Metadata> {
  const { slug, token } = await props.params;
  const tracking = await loadTracking(slug, token);
  return {
    title: tracking ? `Orden #${tracking.order.folio} — ${tracking.business.name}` : "Seguimiento de orden",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

// Pasos que ve el cliente. Autorización y refacción son pausas dentro de diagnóstico y reparación.
const STEPS = ["Recibido", "Diagnóstico", "Reparación", "Listo", "Entregado"];

const STEP_BY_STATUS: Record<Exclude<OrderStatus, "cancelled">, number> = {
  received: 0,
  diagnosing: 1,
  awaiting_approval: 1,
  waiting_parts: 2,
  in_repair: 2,
  ready: 3,
  delivered: 4,
};

function statusMessage(order: PublicTracking["order"]): { title: string; detail: string } {
  switch (order.status) {
    case "received":
      return { title: "Recibimos tu equipo", detail: "Pronto empezaremos a revisarlo." };
    case "diagnosing":
      return { title: "Estamos revisando tu equipo", detail: "Te avisaremos cuando tengamos el diagnóstico." };
    case "awaiting_approval":
      return {
        title: "Esperamos tu autorización",
        detail: "Ya tenemos el diagnóstico. Comunícate con el taller para autorizar la reparación.",
      };
    case "waiting_parts":
      return { title: "Esperando refacción", detail: "Pedimos la pieza necesaria para reparar tu equipo." };
    case "in_repair":
      return { title: "Estamos reparando tu equipo", detail: "Te avisaremos cuando esté listo." };
    case "ready":
      return order.outcome === "not_repaired"
        ? { title: "Tu equipo está listo para recoger", detail: "No fue posible repararlo. Puedes pasar por él al taller." }
        : { title: "Tu equipo está listo", detail: "Puedes pasar a recogerlo al taller." };
    case "delivered":
      return {
        title: "Equipo entregado",
        detail: order.deliveredAt ? `Lo entregamos el ${dateFormatter.format(order.deliveredAt)}.` : "",
      };
    case "cancelled":
      return { title: "Orden cancelada", detail: "Si tienes dudas, comunícate con el taller." };
  }
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      {title && <h2 className="mb-3 text-sm font-medium text-zinc-500">{title}</h2>}
      {children}
    </section>
  );
}

function Progress({ status }: { status: Exclude<OrderStatus, "cancelled"> }) {
  const current = STEP_BY_STATUS[status];
  return (
    <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Avance de la orden">
      {STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step} aria-current={index === current ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${done ? "bg-ink" : "bg-zinc-200"}`} />
            <span
              className={`text-[11px] leading-tight ${index === current ? "font-medium text-zinc-900" : done ? "text-zinc-600" : "text-zinc-400"}`}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-zinc-900" : "text-zinc-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex flex-1 bg-zinc-50">
      <main className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="font-medium">Este enlace no es válido</p>
          <p className="mt-1 text-sm text-zinc-500">
            Revisa que esté completo o pide en el taller que te lo vuelvan a compartir.
          </p>
        </div>
      </main>
    </div>
  );
}

export default async function TrackingPage(props: PageProps<"/s/[slug]/[token]">) {
  const { slug, token } = await props.params;
  const tracking = await loadTracking(slug, token);
  if (!tracking) return <InvalidLink />;

  const { business, order, events, money, photos, partsToGet } = tracking;
  const message = statusMessage(order);
  const cancelled = order.status === "cancelled";
  const delivered = order.status === "delivered";
  const hasLines = toCents(money.total) > 0;
  // Sin reparación registrada se muestra el presupuesto (y el diagnóstico aparte); con ella, el total.
  const showEstimate = money.usesEstimate && money.estimatedCost !== null;
  const showMoney = !cancelled && (hasLines || money.usesEstimate || toCents(money.paidTotal) > 0);
  const showBalance = !delivered && (hasLines || money.usesEstimate);
  // Garantía del equipo reparado y entregado, con los días que le quedan.
  const warranty = delivered ? getWarrantyStatus(order) : null;
  const photoBase = `/api/seguimiento/${encodeURIComponent(slug)}/${token}/photos`;

  return (
    <div className={`${brandFonts} flex-1 bg-zinc-50`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
        <header>
          <p className="text-lg font-semibold tracking-tight">{business.name}</p>
          {(business.phone || business.address) && (
            <div className="mt-1 space-y-0.5 text-sm text-zinc-600">
              {business.phone && (
                <p>
                  Tel.{" "}
                  <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                    {business.phone}
                  </a>
                </p>
              )}
              {business.address && <p className="whitespace-pre-line">{business.address}</p>}
            </div>
          )}
        </header>

        <Card>
          <p className="text-sm text-zinc-500">
            {order.customerFirstName ? `Hola, ${order.customerFirstName}` : "Hola"} · <span className="font-folio">Orden #{order.folio}</span>
          </p>
          <p className="mt-0.5 text-sm text-zinc-700">{order.device}</p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{message.title}</h1>
          {message.detail && <p className="mt-1 text-sm text-zinc-600">{message.detail}</p>}
          {!cancelled && <Progress status={order.status as Exclude<OrderStatus, "cancelled">} />}
          {!cancelled && !delivered && order.promisedOn && (
            <p className="mt-4 rounded-lg bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-700">
              Fecha estimada de entrega: <span className="font-medium">{formatDay(order.promisedOn)}</span>
            </p>
          )}
          {warranty && (
            <p
              className={`mt-4 rounded-lg px-3.5 py-2.5 text-sm ${warranty.active ? "bg-ink-soft text-zinc-800" : "bg-zinc-100 text-zinc-600"}`}
            >
              {warranty.active ? (
                <>
                  Garantía: {warranty.label} ·{" "}
                  <span className="font-medium">{describeWarrantyRemaining(warranty, "customer")}</span>.
                </>
              ) : (
                <>
                  Garantía: {warranty.label} · La garantía terminó el {warranty.until}.
                </>
              )}
            </p>
          )}
        </Card>

        <Card title="Tu equipo">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">Falla reportada</dt>
              <dd className="mt-0.5 whitespace-pre-line text-zinc-900">{order.reportedIssue}</dd>
            </div>
            {partsToGet.length > 0 && (
              <div>
                <dt className="text-zinc-500">Refacciones por conseguir</dt>
                <dd className="mt-0.5 text-zinc-900">
                  <ul className="space-y-0.5">
                    {partsToGet.map((part, index) => (
                      <li key={index}>
                        {part.description}
                        <span className="text-zinc-500 tabular-nums"> × {part.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {order.diagnosis && (
              <div>
                <dt className="text-zinc-500">Diagnóstico</dt>
                <dd className="mt-0.5 whitespace-pre-line text-zinc-900">{order.diagnosis}</dd>
              </div>
            )}
          </dl>
        </Card>

        {showMoney && (
          <Card title="Importe">
            <dl className="space-y-1.5 text-sm">
              {showEstimate && money.estimatedCost !== null && (
                <MoneyRow label="Presupuesto" value={formatMoney(money.estimatedCost)} />
              )}
              {money.diagnosis && <MoneyRow label="Diagnóstico" value={formatMoney(money.diagnosis)} />}
              {money.hasWork && <MoneyRow label="Total" value={formatMoney(money.total)} />}
              <MoneyRow label="Pagado" value={formatMoney(money.paidTotal)} />
              {showBalance && <MoneyRow label="Saldo" value={formatMoney(money.balance)} strong />}
            </dl>
            {money.diagnosisDiscount && (
              <p className="mt-3 text-xs text-zinc-500">
                {money.diagnosisDiscount.full
                  ? "Diagnóstico descontado de la reparación."
                  : `Se descuentan ${formatMoney(money.diagnosisDiscount.amount)} del diagnóstico.`}
              </p>
            )}
            {money.diagnosisCreditPending && !delivered && (
              <p className="mt-3 text-xs text-zinc-500">El diagnóstico se descuenta del presupuesto si se hace la reparación.</p>
            )}
            {money.usesEstimate && !delivered && (
              <p className="mt-3 text-xs text-zinc-500">El importe final puede cambiar según la reparación.</p>
            )}
          </Card>
        )}

        {photos && photos.length > 0 && (
          <Card title="Fotos del equipo">
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <li key={photo.id}>
                  <a href={`${photoBase}/${photo.id}`} target="_blank" rel="noopener" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto servida por una ruta que valida el enlace */}
                    <img
                      src={`${photoBase}/${photo.id}`}
                      alt={`Foto ${index + 1} del equipo`}
                      loading="lazy"
                      className="aspect-square w-full rounded-lg bg-zinc-100 object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {events.length > 0 && (
          <Card title="Historial">
            <ol className="space-y-2.5 text-sm">
              {[...events].reverse().map((event, index) => (
                <li key={`${event.status}-${event.createdAt.toISOString()}-${index}`} className="flex justify-between gap-3">
                  <span className={index === 0 ? "font-medium text-zinc-900" : "text-zinc-600"}>
                    {ORDER_STATUS_LABELS[event.status]}
                  </span>
                  <span className="text-right text-zinc-500 tabular-nums">{dateTimeFormatter.format(event.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </main>
    </div>
  );
}
