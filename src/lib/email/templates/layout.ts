// Estructura común de los correos al cliente, con el estilo de CellFix: fondo azul "mat", el
// comprobante en papel blanco con perforación y un sello morado con el estado. Pensado para
// clientes de correo: tablas, estilos en línea, sin JavaScript y un ancho máximo de 560 px.

export type EmailBusiness = { name: string; phone: string; address: string };

export const COLORS = {
  ink: "#4f3dc7",
  inkSoft: "#ece9fb",
  mat: "#2f4858",
  matDeep: "#243a47",
  matText: "#b9c9d3",
  paper: "#ffffff",
  zinc900: "#18181b",
  zinc700: "#3f3f46",
  zinc600: "#52525b",
  zinc500: "#71717a",
  zinc300: "#d4d4d8",
  zinc200: "#e4e4e7",
  zinc100: "#f4f4f5",
};

export const FONTS = {
  display: "'Archivo', 'Arial Narrow', Arial, Helvetica, sans-serif",
  body: "'Instrument Sans', 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', Menlo, Consolas, 'Courier New', monospace",
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Texto con saltos de línea (dirección, falla reportada) como HTML.
export function multiline(value: string) {
  return escapeHtml(value.trim()).replace(/\r?\n/g, "<br>");
}

const shortDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

export function formatEmailDate(date: Date) {
  return shortDateFormatter.format(date);
}

// Renglón "etiqueta · valor" de los datos de la orden. `value` ya viene como HTML.
export function detailRow(label: string, value: string, options: { mono?: boolean; strong?: boolean } = {}) {
  const valueStyle = [
    `font-family:${options.mono ? FONTS.mono : FONTS.body}`,
    "font-size:15px",
    "line-height:22px",
    `color:${COLORS.zinc900}`,
    options.strong ? "font-weight:700" : "",
  ]
    .filter(Boolean)
    .join(";");
  return `<tr>
  <td class="cf-label" valign="top" style="padding:5px 16px 5px 0;width:128px;font-family:${FONTS.body};font-size:14px;line-height:22px;color:${COLORS.zinc500};">${escapeHtml(label)}</td>
  <td valign="top" style="padding:5px 0;${valueStyle}">${value}</td>
</tr>`;
}

export function detailTable(rows: string[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join("")}</table>`;
}

// Botón compatible con la mayoría de los clientes (incluido Outlook, sin esquinas redondas).
export function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${COLORS.ink}" style="border-radius:8px;background-color:${COLORS.ink};">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONTS.body};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

// Sello de goma con el estado, como el de la página de CellFix.
export function stamp(label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
  <tr>
    <td style="padding:3px;border:2px solid ${COLORS.ink};border-radius:8px;">
      <div style="padding:7px 12px 6px;border:3px solid ${COLORS.ink};border-radius:5px;font-family:${FONTS.display};font-size:17px;line-height:18px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.ink};white-space:nowrap;">${escapeHtml(label)}</div>
    </td>
  </tr>
</table>`;
}

// Recuadro suave (morado claro) para indicaciones importantes.
export function note(html: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
  <tr>
    <td style="padding:14px 16px;border-radius:8px;background-color:${COLORS.inkSoft};font-family:${FONTS.body};font-size:14px;line-height:21px;color:${COLORS.zinc900};">${html}</td>
  </tr>
</table>`;
}

export type LayoutInput = {
  title: string;
  preheader: string;
  business: EmailBusiness;
  folio: number;
  // Fecha de la orden en el encabezado del comprobante.
  date: Date;
  stampLabel: string;
  // Cuerpo del comprobante (HTML), arriba de la perforación.
  body: string;
  // Texto del talón del cliente, abajo de la perforación.
  stub: { title: string; detail: string };
  // Datos de contacto del taller al pie; se omiten si el cuerpo ya los muestra.
  footerContact?: boolean;
  // URL pública de la app para el fondo con cuadrícula (public/email/mat-grid.png); null sin URL.
  assetBaseUrl?: string | null;
};

// Cuadrícula del tapete antiestático, como la sección "El recorrido" del sitio. Gmail no pinta
// degradados de fondo, así que con URL pública se usa una imagen que se repite; sin ella, el
// degradado (Apple Mail y iOS lo muestran) sobre el color sólido, que es el respaldo de todos.
function matBackground(assetBaseUrl: string | null | undefined) {
  if (assetBaseUrl) {
    const tile = escapeHtml(`${assetBaseUrl}/email/mat-grid.png`);
    return {
      attribute: ` background="${tile}"`,
      style: `background-color:${COLORS.mat};background-image:url('${tile}');background-repeat:repeat;`,
    };
  }
  return {
    attribute: "",
    style:
      `background-color:${COLORS.mat};` +
      "background-image:linear-gradient(#3d5a6b 1px, transparent 1px),linear-gradient(90deg, #3d5a6b 1px, transparent 1px);" +
      "background-size:48px 48px;",
  };
}

export function renderLayout(input: LayoutInput) {
  const { business } = input;
  const background = matBackground(input.assetBaseUrl);
  const businessName = escapeHtml(business.name);
  const folio = `#${input.folio}`;
  const phoneHref = business.phone.replace(/[^\d+]/g, "");
  const contact = input.footerContact === false ? "" : [
    business.address ? multiline(business.address) : "",
    business.phone
      ? `Tel. <a href="tel:${escapeHtml(phoneHref)}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(business.phone)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("<br>");
  // Muesca de la perforación: toma el color del fondo para simular el corte del papel.
  const notch = (side: "left" | "right") =>
    `<td width="14" style="width:14px;height:28px;padding:0;background-color:${COLORS.mat};border-radius:${side === "left" ? "0 14px 14px 0" : "14px 0 0 14px"};font-size:0;line-height:0;">&nbsp;</td>`;

  return `<!DOCTYPE html>
<html lang="es-MX" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(input.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,600..800&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; }
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
  @media only screen and (max-width:600px) {
    .cf-outer { padding:20px 10px !important; }
    .cf-pad { padding-left:20px !important; padding-right:20px !important; }
    .cf-title { font-size:24px !important; line-height:29px !important; }
    .cf-folio { font-size:22px !important; }
    .cf-label { width:104px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.mat};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.mat};">${escapeHtml(input.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.mat}"${background.attribute} style="${background.style}">
  <tr>
    <td class="cf-outer" align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="padding:0 4px 16px;font-family:${FONTS.display};font-size:19px;line-height:24px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;">${businessName}</td>
        </tr>
        <tr>
          <td style="background-color:${COLORS.paper};border-radius:6px;box-shadow:0 18px 40px -12px rgba(0,0,0,0.45);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="cf-pad" style="padding:26px 32px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="top" style="padding-bottom:16px;border-bottom:1px solid ${COLORS.zinc200};">
                        <div style="font-family:${FONTS.display};font-size:11px;line-height:14px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${COLORS.zinc500};">Orden de servicio</div>
                        <div style="padding-top:4px;font-family:${FONTS.body};font-size:14px;line-height:20px;color:${COLORS.zinc500};">${businessName} · ${escapeHtml(formatEmailDate(input.date))}</div>
                      </td>
                      <td class="cf-folio" valign="top" align="right" style="padding-bottom:16px;border-bottom:1px solid ${COLORS.zinc200};font-family:${FONTS.mono};font-size:26px;line-height:30px;font-weight:500;color:${COLORS.zinc900};white-space:nowrap;">${folio}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="cf-pad" style="padding:24px 32px 8px;">
                  ${stamp(input.stampLabel)}
                </td>
              </tr>
              <tr>
                <td class="cf-pad" style="padding:12px 32px 28px;">
                  ${input.body}
                </td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      ${notch("left")}
                      <td style="padding:0 6px;"><div style="height:0;border-top:2px dashed ${COLORS.zinc300};font-size:0;line-height:0;">&nbsp;</div></td>
                      ${notch("right")}
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="cf-pad" style="padding:12px 32px 22px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="middle" style="font-family:${FONTS.body};font-size:13px;line-height:19px;color:${COLORS.zinc500};">
                        ${escapeHtml(input.stub.title)}<br>${escapeHtml(input.stub.detail)}
                      </td>
                      <td valign="middle" align="right" style="padding-left:12px;font-family:${FONTS.mono};font-size:18px;line-height:22px;color:${COLORS.zinc900};white-space:nowrap;">${folio}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${
          contact
            ? `<tr>
          <td style="padding:22px 4px 0;font-family:${FONTS.body};font-size:14px;line-height:21px;color:#ffffff;">
            <div style="font-weight:600;">${businessName}</div>
            <div style="color:${COLORS.matText};">${contact}</div>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:22px 4px 0;font-family:${FONTS.body};font-size:12px;line-height:18px;color:${COLORS.matText};">
            Recibes este correo porque dejaste un equipo en ${businessName}.<br>
            Enviado con <span style="font-family:${FONTS.display};font-weight:700;color:#ffffff;">CellFix</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Pie del texto plano con los datos del taller.
export function textFooter(business: EmailBusiness) {
  return [
    "—",
    business.name,
    ...(business.address ? [business.address.trim()] : []),
    ...(business.phone ? [`Tel. ${business.phone}`] : []),
    "",
    "Enviado con CellFix",
  ].join("\n");
}
