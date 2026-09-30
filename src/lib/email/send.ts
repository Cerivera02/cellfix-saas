import "server-only";
import { Resend } from "resend";

// Envío de correos transaccionales con Resend. Sin RESEND_API_KEY o RESEND_FROM_EMAIL (p. ej. en
// desarrollo local) no se envía nada: se avisa una vez en la consola y se sigue sin error.

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Nombre que ve el cliente como remitente (el del taller); la dirección es la de RESEND_FROM_EMAIL.
  fromName?: string;
};

let client: Resend | null = null;
let warnedMissingEnv = false;

// Dirección de RESEND_FROM_EMAIL, que puede venir como "correo" o "Nombre <correo>".
function fromAddress(configured: string) {
  const match = configured.match(/<([^<>]+)>\s*$/);
  return (match ? match[1] : configured).trim();
}

// Nombre del remitente seguro para el encabezado From: sin comillas, <>, barras invertidas ni
// caracteres de control (saltos de línea), y con un largo máximo.
export function displayName(name: string) {
  return name
    .replace(/["<>\\]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
}

// false (con un aviso la primera vez) si faltan las variables de Resend.
export function isEmailConfigured() {
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL?.trim()) return true;
  if (!warnedMissingEnv) {
    warnedMissingEnv = true;
    console.warn("Correos al cliente desactivados: faltan RESEND_API_KEY o RESEND_FROM_EMAIL.");
  }
  return false;
}

// true si Resend aceptó el correo. Nunca lanza: los errores se registran y se devuelve false.
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (!isEmailConfigured() || !apiKey || !configuredFrom) return false;

  const name = email.fromName ? displayName(email.fromName) : "";
  const from = name ? `"${name}" <${fromAddress(configuredFrom)}>` : configuredFrom;

  try {
    client ??= new Resend(apiKey);
    const { error } = await client.emails.send({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) {
      console.error("Error de Resend al enviar correo al cliente:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("No se pudo enviar el correo al cliente:", error);
    return false;
  }
}
