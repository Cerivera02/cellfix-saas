import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelOrderDialog, DeliverDialog, OrderPaymentDialog } from "@/components/orders/charge-dialogs";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { UnlockValue } from "@/components/orders/unlock-view";
import { PhotoEvidence } from "@/components/photos/photo-evidence";
import {
  DiagnosisDialog,
  LaborDialog,
  PartDialog,
  ReleaseDialog,
  StatusDialog,
} from "@/components/orders/work-dialogs";
import { ActionButton } from "@/components/ui/action-button";
import { dangerGhostButtonClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { listBankAccounts } from "@/lib/cash/core";
import { dateTimeFormatter } from "@/lib/cash/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/cash/labels";
import { fromCents, toCents } from "@/lib/cash/money";
import { addDays, formatDay } from "@/lib/dates";
import { describeTax, formatMoney } from "@/lib/inventory/format";
import {
  addLaborAction,
  addOrderPaymentAction,
  addPartAction,
  cancelOrderAction,
  changeStatusAction,
  deliverOrderAction,
  releaseOrderAction,
  removeLineAction,
  takeOrderAction,
  updateDiagnosisAction,
} from "@/lib/orders/actions";
import { getOrder, type OrderLine } from "@/lib/orders/core";
import { listPhotos } from "@/lib/photos/core";
import {
  ORDER_ACCESS_PERMISSIONS,
  ORDER_OUTCOME_LABELS,
  ORDER_PAYMENT_KIND_LABELS,
  ORDER_STATUS_LABELS,
  canSeeOrderPrices,
  describeDevice,
  isActiveStatus,
} from "@/lib/orders/labels";

export const metadata: Metadata = {
  title: "Orden — CellFix",
};

const dayDateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className={`mt-1 break-words whitespace-pre-line text-zinc-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

// Precio por pieza que se cobra: en refacciones incluye la mano de obra.
function chargedUnitPrice(line: OrderLine) {
  return fromCents(toCents(line.unitPrice) + toCents(line.laborPrice));
}

export default async function OrderPage(props: PageProps<"/dashboard/orders/[id]">) {
  const session = await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  const can = (permission: (typeof session.permissions)[number]) => session.permissions.includes(permission);
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const order = await getOrder(session.tenant.id, id);
  if (!order) notFound();
  const photos = await listPhotos(session.tenant.id, { orderId: order.id });

  const active = isActiveStatus(order.status);
  const isTechnician = can("repairs.work") && active;
  // Solo el técnico que tomó la orden la trabaja; el propietario puede hacerlo en cualquiera.
  const canWork = isTechnician && (order.technicianId === session.user.id || session.isOwner);
  const canIntake = can("orders.intake") && active;
  const canCollect = can("payments.collect");
  // Los técnicos no ven precios, presupuestos ni cobros.
  const canSeePrices = canSeeOrderPrices(session.permissions);
  const accounts =
    active && canCollect
      ? (await listBankAccounts(session.tenant.id, { activeOnly: true })).map((account) => ({
          id: account.id,
          bankName: account.bankName,
          holderName: account.holderName,
          clabe: account.clabe,
          alias: account.alias,
        }))
      : [];

  const totalCents = toCents(order.total);
  const paidCents = toCents(order.paidTotal);
  const balanceCents = totalCents - paidCents;
  const mayTake =
    isTechnician && order.technicianId !== session.user.id && (order.technicianId === null || session.isOwner);
  const mayRelease = canWork && order.technicianId !== null && order.status !== "ready";
  const canRemove = (line: OrderLine) => active && (line.kind === "part" ? canWork : canSeePrices);
  const showRemoveColumn = order.lines.some(canRemove);
  const warrantyUntil =
    order.deliveredAt && order.outcome === "repaired" && order.warrantyDays > 0
      ? addDays(order.deliveredAt, order.warrantyDays)
      : null;
  const lastChange = [...order.payments].reverse().find((payment) => toCents(payment.changeAmount) > 0);

  return (
    <>
      <Link href="/dashboard/orders" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Órdenes
      </Link>

      {searchParams.nueva === "1" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="font-medium text-emerald-900">Orden #{order.folio} registrada</p>
          {canSeePrices && (
            <Link href={`/dashboard/orders/${order.id}/receipt`} className={primaryButtonClass}>
              Imprimir comprobante
            </Link>
          )}
        </div>
      )}
      {searchParams.entregada === "1" && order.status === "delivered" && canSeePrices && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div>
            <p className="font-medium text-emerald-900">Equipo entregado</p>
            {lastChange && (
              <p className="text-sm text-emerald-800">
                Cambio a entregar: <span className="font-semibold tabular-nums">{formatMoney(lastChange.changeAmount)}</span>
              </p>
            )}
          </div>
          <Link href={`/dashboard/orders/${order.id}/receipt`} className={primaryButtonClass}>
            Imprimir ticket
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">Orden #{order.folio}</h1>
            <OrderStatusBadge status={order.status} />
            {order.outcome && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {ORDER_OUTCOME_LABELS[order.outcome]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {describeDevice(order)} ·{" "}
            <Link href={`/dashboard/customers/${order.customerId}`} className="font-medium text-zinc-900 hover:underline">
              {order.customerName}
            </Link>
            {order.customerPhone && ` (${order.customerPhone})`}
          </p>
          <p className="text-sm text-zinc-500">
            Recibida {dateTimeFormatter.format(order.createdAt)}
            {order.createdByName && ` por ${order.createdByName}`} ·{" "}
            {order.technicianName ? `Técnico: ${order.technicianName}` : "En la cola, sin técnico"}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {mayTake && (
            <ActionButton
              action={takeOrderAction.bind(null, order.id)}
              label={order.technicianId ? "Tomar orden (reasignar)" : "Tomar orden"}
              pendingLabel="Asignando…"
              className={primaryButtonClass}
            />
          )}
          {canWork && <StatusDialog action={changeStatusAction.bind(null, order.id)} current={order.status} />}
          {mayRelease && <ReleaseDialog action={releaseOrderAction.bind(null, order.id)} />}
          {order.status === "ready" && can("orders.deliver") && (
            <DeliverDialog
              action={deliverOrderAction.bind(null, order.id)}
              accounts={accounts}
              totalCents={totalCents}
              paidCents={paidCents}
              canCollect={canCollect}
            />
          )}
          {canSeePrices && (
            <Link href={`/dashboard/orders/${order.id}/receipt`} className={secondaryButtonClass}>
              {order.status === "delivered" ? "Ticket" : "Comprobante"}
            </Link>
          )}
          {canIntake && (
            <Link href={`/dashboard/orders/${order.id}/edit`} className={secondaryButtonClass}>
              Editar
            </Link>
          )}
          {canIntake && <CancelOrderDialog action={cancelOrderAction.bind(null, order.id)} paidTotal={order.paidTotal} />}
        </div>
      </div>

      {isTechnician && order.technicianId && !canWork && (
        <p className="mt-4 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          Esta orden la tiene {order.technicianName}. Si la devuelve a la cola podrás tomarla.
        </p>
      )}
      {order.status === "cancelled" && order.cancelReason && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Cancelada: {order.cancelReason}</p>
      )}
      {warrantyUntil && (
        <p className="mt-4 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          Garantía de {order.warrantyDays} días: vigente hasta el {dayDateFormatter.format(warrantyUntil)}
          {warrantyUntil < new Date() && " (vencida)"}.
        </p>
      )}

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Equipo</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Equipo" value={describeDevice(order)} />
            <Detail label="IMEI o serie" value={order.serialNumber || "—"} mono />
            <Detail label="Color" value={order.color || "—"} />
            <Detail label="Desbloqueo" value={<UnlockValue type={order.unlockType} code={order.unlockCode} />} />
            <div className="sm:col-span-2">
              <Detail label="Accesorios" value={order.accessories || "Ninguno"} />
            </div>
            <div className="sm:col-span-2">
              <Detail label="Estado físico" value={order.deviceCondition || "—"} />
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-medium">Servicio</h2>
            {(canWork || canIntake) && (
              <DiagnosisDialog
                action={updateDiagnosisAction.bind(null, order.id)}
                defaults={{
                  diagnosis: order.diagnosis,
                  estimatedCost: canSeePrices ? (order.estimatedCost ?? "") : "",
                  promisedOn: order.promisedOn ?? "",
                }}
                showEstimate={canSeePrices}
              />
            )}
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Detail label="Falla reportada" value={order.reportedIssue} />
            </div>
            <div className="sm:col-span-2">
              <Detail label="Diagnóstico" value={order.diagnosis || "Pendiente"} />
            </div>
            {canSeePrices && (
              <Detail label="Costo estimado" value={order.estimatedCost !== null ? formatMoney(order.estimatedCost) : "—"} />
            )}
            <Detail label="Fecha prometida" value={order.promisedOn ? formatDay(order.promisedOn) : "—"} />
            <Detail label="Garantía" value={order.warrantyDays > 0 ? `${order.warrantyDays} días` : "Sin garantía"} />
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Evidencia fotográfica</h2>
        <div className="mt-3">
          <PhotoEvidence
            orderId={order.id}
            initialPhotos={photos.map((photo) => ({ id: photo.id }))}
            canUpload={active && (can("orders.intake") || can("repairs.work"))}
            canDelete={active && (can("orders.intake") || can("repairs.work"))}
          />
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{canSeePrices ? "Refacciones y mano de obra" : "Refacciones"}</h2>
          <div className="flex flex-wrap gap-2">
            {canWork && <PartDialog action={addPartAction.bind(null, order.id)} />}
            {active && canSeePrices && <LaborDialog action={addLaborAction.bind(null, order.id)} />}
            {canWork && can("purchases.manage") && (
              <Link href={`/dashboard/purchases/new?orden=${order.id}`} className={secondaryButtonClass}>
                Comprar refacción
              </Link>
            )}
          </div>
        </div>

        {order.lines.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            {order.status === "cancelled" ? "Sin conceptos." : "Aún no se agregan refacciones."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Concepto</th>
                  <th className="px-5 py-3 text-right font-medium">Cant.</th>
                  {canSeePrices && (
                    <>
                      <th className="px-5 py-3 text-right font-medium">Precio</th>
                      <th className="px-5 py-3 text-right font-medium">Importe</th>
                    </>
                  )}
                  {showRemoveColumn && (
                    <th className="px-5 py-3">
                      <span className="sr-only">Quitar</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {order.lines.map((line) => (
                  <tr key={line.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="text-zinc-900">
                        {line.itemId && can("inventory.view") ? (
                          <Link href={`/dashboard/inventory/items/${line.itemId}`} className="hover:underline">
                            {line.description}
                          </Link>
                        ) : (
                          line.description
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {line.kind === "part" ? "Refacción" : "Mano de obra"}
                        {canSeePrices && line.kind === "part" && toCents(line.laborPrice) > 0 && (
                          <>
                            {" "}
                            · Pieza {formatMoney(line.unitPrice)} + mano de obra {formatMoney(line.laborPrice)}
                          </>
                        )}
                        {canSeePrices && ` · ${describeTax(line.taxRate, line.taxIncluded)}`}
                        {line.userName && ` · ${line.userName}`}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{line.quantity}</td>
                    {canSeePrices && (
                      <>
                        <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums">
                          {formatMoney(chargedUnitPrice(line))}
                        </td>
                        <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                          {formatMoney(line.total)}
                        </td>
                      </>
                    )}
                    {showRemoveColumn && (
                      <td className="px-5 py-2 text-right">
                        {canRemove(line) && (
                          <ActionButton
                            action={removeLineAction.bind(null, order.id, line.id)}
                            label="Quitar"
                            pendingLabel="Quitando…"
                            confirm={
                              line.kind === "part"
                                ? `¿Quitar ${line.description}? Regresa al inventario.`
                                : `¿Quitar ${line.description}?`
                            }
                            className={dangerGhostButtonClass}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {canSeePrices && (
                <tfoot className="border-t border-zinc-200">
                  <tr>
                    <td colSpan={3} className="px-5 pt-3 text-right text-zinc-600">
                      Subtotal
                    </td>
                    <td className="px-5 pt-3 text-right tabular-nums">{formatMoney(order.subtotal)}</td>
                    {showRemoveColumn && <td />}
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-5 text-right text-zinc-600">
                      IVA
                    </td>
                    <td className="px-5 text-right tabular-nums">{formatMoney(order.taxTotal)}</td>
                    {showRemoveColumn && <td />}
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-5 pb-3 text-right font-medium">
                      Total
                    </td>
                    <td className="px-5 pb-3 text-right text-base font-semibold tabular-nums">{formatMoney(order.total)}</td>
                    {showRemoveColumn && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <div className={`mt-10 grid items-start gap-6 ${canSeePrices ? "lg:grid-cols-2" : ""}`}>
        {canSeePrices && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">Pagos</h2>
              {active && canCollect && (
                <OrderPaymentDialog
                  action={addOrderPaymentAction.bind(null, order.id)}
                  accounts={accounts}
                  suggestedCents={Math.max(balanceCents, 0)}
                  label="Registrar anticipo"
                />
              )}
            </div>
            {order.payments.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Sin pagos registrados.</p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="py-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-zinc-900">
                        {ORDER_PAYMENT_KIND_LABELS[payment.kind]} · {PAYMENT_METHOD_LABELS[payment.method]}
                      </span>
                      <span className={`font-medium tabular-nums ${payment.kind === "refund" ? "text-amber-700" : ""}`}>
                        {payment.kind === "refund" && "−"}
                        {formatMoney(payment.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {dateTimeFormatter.format(payment.createdAt)}
                      {payment.userName && ` · ${payment.userName}`}
                      {payment.bankName && ` · ${payment.bankName}`}
                      {payment.reference && ` · Ref. ${payment.reference}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-600">Total</dt>
                <dd className="tabular-nums">{formatMoney(order.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-600">Pagado</dt>
                <dd className="tabular-nums">{formatMoney(order.paidTotal)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>{balanceCents < 0 ? "A favor del cliente" : "Saldo"}</dt>
                <dd className="tabular-nums">{formatMoney(fromCents(Math.abs(balanceCents)))}</dd>
              </div>
            </dl>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Historial</h2>
          <ol className="mt-3 space-y-3">
            {order.events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="text-zinc-900">
                  {event.status ? ORDER_STATUS_LABELS[event.status] : "Actualización"}
                  {event.note && <span className="text-zinc-600"> · {event.note}</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {dateTimeFormatter.format(event.createdAt)}
                  {event.userName && ` · ${event.userName}`}
                </p>
              </li>
            ))}
          </ol>

          {order.purchases.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-medium">Compras de refacciones para esta orden</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {order.purchases.map((purchase, index) => (
                  <li key={`${purchase.purchaseId}-${index}`}>
                    {can("purchases.manage") || can("inventory.view") ? (
                      <Link href={`/dashboard/purchases/${purchase.purchaseId}`} className="text-zinc-900 hover:underline">
                        Compra #{purchase.folio}
                      </Link>
                    ) : (
                      <span className="text-zinc-900">Compra #{purchase.folio}</span>
                    )}
                    <span className="text-zinc-600">
                      {" "}
                      · {purchase.quantity} × {purchase.itemName} · {purchase.supplierName} · {formatDay(purchase.purchasedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
