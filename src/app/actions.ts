"use server";

import { Resend } from "resend";
import { createRateLimiter } from "@/lib/rate-limit/limiter";
import { LEADS_PER_IP } from "@/lib/rate-limit/limits";
import { clientIp } from "@/lib/rate-limit/server";
import { EMAIL_PATTERN, readField } from "@/lib/validation";

// Cada mensaje del landing manda un correo: límite por IP para que no lo usen como cañón de spam.
const leadsByIp = createRateLimiter("lead", LEADS_PER_IP);

export type LeadFormState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Partial<Record<"name" | "email" | "business", string>>;
  fields?: Record<string, string>;
};

export async function submitLead(
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  // Honeypot: los bots suelen rellenar este campo oculto.
  if (readField(formData, "website", 200)) {
    return { status: "success", message: "Gracias, te contactaremos pronto." };
  }

  const fields = {
    name: readField(formData, "name", 100),
    email: readField(formData, "email", 200),
    business: readField(formData, "business", 150),
    phone: readField(formData, "phone", 30),
    message: readField(formData, "message", 2000),
  };

  const errors: LeadFormState["errors"] = {};
  if (!fields.name) errors.name = "Escribe tu nombre.";
  if (!EMAIL_PATTERN.test(fields.email)) errors.email = "Escribe un correo válido.";
  if (!fields.business) errors.business = "Escribe el nombre de tu negocio.";

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Revisa los campos marcados.", errors, fields };
  }

  if (!(await leadsByIp.consume(await clientIp())).allowed) {
    return {
      status: "error",
      message: "Ya recibimos varios mensajes desde tu conexión. Inténtalo más tarde.",
      fields,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL;

  if (!apiKey || !from || !to) {
    console.error("Faltan variables de entorno de Resend (RESEND_API_KEY, RESEND_FROM_EMAIL, CONTACT_TO_EMAIL).");
    return {
      status: "error",
      message: "No pudimos enviar tu mensaje. Inténtalo más tarde.",
      fields,
    };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: fields.email,
    subject: `Mensaje desde la landing: ${fields.business}`,
    text: [
      `Nombre: ${fields.name}`,
      `Correo: ${fields.email}`,
      `Negocio: ${fields.business}`,
      `Teléfono: ${fields.phone || "—"}`,
      "",
      "Mensaje:",
      fields.message || "—",
    ].join("\n"),
  });

  if (error) {
    console.error("Error de Resend:", error);
    return {
      status: "error",
      message: "No pudimos enviar tu mensaje. Inténtalo más tarde.",
      fields,
    };
  }

  return { status: "success", message: "Gracias, te contactaremos pronto." };
}
