import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/inventory/format";
import type { OrderOutcome } from "@/lib/orders/labels";
import {
  COLORS,
  FONTS,
  button,
  detailRow,
  detailTable,
  escapeHtml,
  multiline,
  note,
  renderLayout,
  textFooter,
  type EmailBusiness,
} from "@/lib/email/templates/layout";

// Correos al cliente de una orden: el enlace de seguimiento al recibir el equipo y el aviso de
// que está listo. Solo datos que el cliente puede ver: nada de contraseñas, notas internas ni
// nombres del personal; del cliente, solo su primer nombre en el saludo.

export type OrderEmailData = {
  business: EmailBusiness;
  customerFirstName: string;
  folio: number;
  device: string;
  reportedIssue: string;
  createdAt: Date;
  promisedOn: string | null;
  // null si el taller no tiene el módulo de seguimiento.
  trackingUrl: string | null;
  // URL pública de la app, para la imagen del fondo; null si no se conoce.
  assetBaseUrl: string | null;
  outcome: OrderOutcome | null;
  money: {
    paid: string;
    balance: string;
    // Sin reparación registrada el saldo se calcula sobre el presupuesto y puede cambiar.
    estimated: boolean;
  };
};

export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

function greeting(firstName: string) {
  return firstName ? `Hola, ${firstName}` : "Hola";
}

function paragraph(html: string, options: { top?: number } = {}) {
  return `<p style="margin:${options.top ?? 12}px 0 0;font-family:${FONTS.body};font-size:16px;line-height:25px;color:${COLORS.zinc700};">${html}</p>`;
}

function heading(text: string) {
  return `<h1 class="cf-title" style="margin:14px 0 0;font-family:${FONTS.display};font-size:28px;line-height:33px;font-weight:800;letter-spacing:-0.4px;color:${COLORS.zinc900};">${escapeHtml(text)}</h1>`;
}

function smallText(html: string, top = 10) {
  return `<p style="margin:${top}px 0 0;font-family:${FONTS.body};font-size:13px;line-height:19px;color:${COLORS.zinc500};">${html}</p>`;
}

function section(title: string, content: string) {
  return `<div style="margin-top:24px;">
  <div style="font-family:${FONTS.display};font-size:11px;line-height:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLORS.zinc500};padding-bottom:6px;">${escapeHtml(title)}</div>
  ${content}
</div>`;
}

function trackingBlock(url: string, label: string) {
  return `<div style="margin-top:26px;">${button(label, url)}</div>
${smallText(`Si el botón no abre, copia este enlace en tu navegador:<br><a href="${escapeHtml(url)}" style="color:${COLORS.ink};word-break:break-all;">${escapeHtml(url)}</a>`, 12)}`;
}

function hasAmount(value: string) {
  return Number(value) > 0;
}

// ---------------------------------------------------------------------------
// Equipo recibido: enlace de seguimiento
// ---------------------------------------------------------------------------

export function renderOrderReceivedEmail(data: OrderEmailData & { trackingUrl: string }): RenderedEmail {
  const { business } = data;
  const subject = `Recibimos tu equipo · Orden #${data.folio} · ${business.name}`;
  const preheader = `Sigue la reparación de tu ${data.device} desde tu celular, cuando quieras.`;

  const rows = [
    detailRow("Orden", `#${data.folio}`, { mono: true }),
    detailRow("Equipo", escapeHtml(data.device)),
    detailRow("Falla reportada", multiline(data.reportedIssue)),
  ];
  if (data.promisedOn) rows.push(detailRow("Entrega estimada", escapeHtml(formatDay(data.promisedOn))));
  if (hasAmount(data.money.paid)) rows.push(detailRow("Anticipo", escapeHtml(formatMoney(data.money.paid)), { mono: true }));

  const body = [
    heading(`${greeting(data.customerFirstName)}, ya tenemos tu equipo`),
    paragraph(
      `Recibimos tu <strong style="color:${COLORS.zinc900};">${escapeHtml(data.device)}</strong> en ${escapeHtml(business.name)}. Desde este enlace puedes ver cómo va la reparación, sin tener que llamar.`,
    ),
    trackingBlock(data.trackingUrl, "Ver cómo va mi reparación"),
    section("Datos de tu orden", detailTable(rows)),
    `<div style="margin-top:24px;">${note("Guarda el comprobante que te dimos en el mostrador: lo vas a necesitar para recoger tu equipo.")}</div>`,
  ].join("\n");

  const html = renderLayout({
    assetBaseUrl: data.assetBaseUrl,
    title: subject,
    preheader,
    business,
    folio: data.folio,
    date: data.createdAt,
    stampLabel: "Recibido",
    body,
    stub: { title: "Talón del cliente", detail: "Preséntalo para recoger tu equipo" },
  });

  const text = [
    `${greeting(data.customerFirstName)}:`,
    "",
    `Recibimos tu ${data.device} en ${business.name}.`,
    "Puedes ver cómo va la reparación en este enlace:",
    data.trackingUrl,
    "",
    `Orden: #${data.folio}`,
    `Equipo: ${data.device}`,
    `Falla reportada: ${data.reportedIssue.trim()}`,
    ...(data.promisedOn ? [`Entrega estimada: ${formatDay(data.promisedOn)}`] : []),
    ...(hasAmount(data.money.paid) ? [`Anticipo: ${formatMoney(data.money.paid)}`] : []),
    "",
    "Guarda el comprobante que te dimos en el mostrador: lo vas a necesitar para recoger tu equipo.",
    "",
    textFooter(business),
  ].join("\n");

  return { subject, preheader, html, text };
}

// ---------------------------------------------------------------------------
// Orden lista para entregar
// ---------------------------------------------------------------------------

export function renderOrderReadyEmail(data: OrderEmailData): RenderedEmail {
  const { business } = data;
  const repaired = data.outcome !== "not_repaired";
  const subject = repaired
    ? `Tu equipo está listo · Orden #${data.folio} · ${business.name}`
    : `Ya puedes recoger tu equipo · Orden #${data.folio} · ${business.name}`;
  const preheader = repaired
    ? `Terminamos la reparación de tu ${data.device}. Ya puedes pasar por él.`
    : `Terminamos de revisar tu ${data.device}. Ya puedes pasar por él.`;

  const balance = hasAmount(data.money.balance) ? formatMoney(data.money.balance) : null;
  const paidInFull = !balance && hasAmount(data.money.paid);
  const balanceLabel = data.money.estimated ? "Saldo estimado" : "Saldo por pagar";

  const rows = [detailRow("Orden", `#${data.folio}`, { mono: true }), detailRow("Equipo", escapeHtml(data.device))];
  if (balance) rows.push(detailRow(balanceLabel, escapeHtml(balance), { mono: true, strong: true }));
  else if (paidInFull) rows.push(detailRow("Saldo", "Pagado, no debes nada", { strong: true }));

  const bring = [
    "El comprobante (talón) que te dimos al dejar el equipo.",
    ...(balance ? [`${balanceLabel}: ${balance}.`] : []),
  ];
  const bringHtml = `<strong>Qué llevar</strong><br>${bring.map((item) => `• ${escapeHtml(item)}`).join("<br>")}`;

  const intro = repaired
    ? `Terminamos la reparación de tu <strong style="color:${COLORS.zinc900};">${escapeHtml(data.device)}</strong>. Ya puedes pasar a recogerlo a ${escapeHtml(business.name)}.`
    : `Revisamos tu <strong style="color:${COLORS.zinc900};">${escapeHtml(data.device)}</strong> con cuidado, pero esta vez no fue posible repararlo. Lo sentimos mucho. Ya puedes pasar a recogerlo a ${escapeHtml(business.name)}.`;

  const addressHtml = business.address
    ? detailRow("Dirección", multiline(business.address))
    : "";
  const phoneHtml = business.phone
    ? detailRow(
        "Teléfono",
        `<a href="tel:${escapeHtml(business.phone.replace(/[^\d+]/g, ""))}" style="color:${COLORS.zinc900};text-decoration:underline;">${escapeHtml(business.phone)}</a>`,
      )
    : "";

  const body = [
    heading(repaired ? `${greeting(data.customerFirstName)}, tu equipo está listo` : `${greeting(data.customerFirstName)}, ya puedes recoger tu equipo`),
    paragraph(intro),
    ...(repaired ? [] : [paragraph("Si tienes dudas sobre la revisión, con gusto te explicamos en el taller.")]),
    `<div style="margin-top:22px;">${note(bringHtml)}</div>`,
    section("Datos de tu orden", detailTable(rows)),
    ...(data.money.estimated && balance ? [smallText("El importe final te lo confirmamos en el taller.")] : []),
    ...(addressHtml || phoneHtml ? [section("Dónde recogerlo", detailTable([addressHtml, phoneHtml].filter(Boolean)))] : []),
    ...(data.trackingUrl ? [trackingBlock(data.trackingUrl, "Ver mi orden")] : []),
  ].join("\n");

  const html = renderLayout({
    assetBaseUrl: data.assetBaseUrl,
    title: subject,
    preheader,
    business,
    folio: data.folio,
    date: data.createdAt,
    stampLabel: repaired ? "Listo para entregar" : "Listo para recoger",
    body,
    stub: { title: "Talón del cliente", detail: "Preséntalo para recoger tu equipo" },
    footerContact: !(addressHtml || phoneHtml),
  });

  const text = [
    `${greeting(data.customerFirstName)}:`,
    "",
    repaired
      ? `Terminamos la reparación de tu ${data.device}. Ya puedes pasar a recogerlo a ${business.name}.`
      : `Revisamos tu ${data.device} con cuidado, pero esta vez no fue posible repararlo. Lo sentimos mucho. Ya puedes pasar a recogerlo a ${business.name}.`,
    ...(repaired ? [] : ["Si tienes dudas sobre la revisión, con gusto te explicamos en el taller."]),
    "",
    "Qué llevar:",
    ...bring.map((item) => `- ${item}`),
    "",
    `Orden: #${data.folio}`,
    `Equipo: ${data.device}`,
    ...(balance ? [`${balanceLabel}: ${balance}`] : paidInFull ? ["Saldo: pagado, no debes nada"] : []),
    ...(data.money.estimated && balance ? ["El importe final te lo confirmamos en el taller."] : []),
    ...(data.trackingUrl ? ["", "Ver tu orden:", data.trackingUrl] : []),
    "",
    textFooter(business),
  ].join("\n");

  return { subject, preheader, html, text };
}
