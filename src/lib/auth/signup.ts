"use server";

import { redirect } from "next/navigation";
import { clientIp, takeRateLimit } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { EmailTakenError } from "@/lib/team/core";
import { createTenantWithOwner } from "@/lib/tenancy/create";
import { EMAIL_PATTERN, getPasswordError, readField, readPassword } from "@/lib/validation";

const HOUR_MS = 60 * 60 * 1000;

// Tope global de registros por hora, sin importar la IP: freno de emergencia si alguien
// logra saltarse el límite por IP (cada registro crea un schema en la base).
const MAX_SIGNUPS_PER_HOUR = 20;

async function tooManyRecentSignups() {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM tenants
      WHERE trial_ends_at IS NOT NULL AND created_at > now() - interval '1 hour'`,
  );
  return (rows[0]?.count ?? 0) >= MAX_SIGNUPS_PER_HOUR;
}

// Registro público: crea el taller en prueba gratuita con todos los módulos, su propietario,
// e inicia sesión. Protegido con un campo trampa y un límite de intentos por IP.
export async function signup(_prevState: FormState, formData: FormData): Promise<FormState> {
  const fields = {
    businessName: readField(formData, "businessName", 150),
    name: readField(formData, "name", 100),
    email: readField(formData, "email", 200).toLowerCase(),
  };
  const password = readPassword(formData);

  // Campo trampa: invisible para personas, los bots lo llenan.
  if (readField(formData, "website", 200)) {
    return { message: "No pudimos crear tu cuenta. Inténtalo de nuevo.", fields };
  }

  const ip = await clientIp();
  if (!takeRateLimit(`signup:${ip}`, 10, HOUR_MS)) {
    return { message: "Hiciste demasiados intentos. Espera un rato e inténtalo de nuevo.", fields };
  }

  const errors: Record<string, string> = {};
  if (fields.businessName.length < 2) errors.businessName = "Escribe el nombre de tu negocio.";
  if (fields.name.length < 2) errors.name = "Escribe tu nombre.";
  if (!EMAIL_PATTERN.test(fields.email)) errors.email = "Escribe un correo válido.";
  const passwordError = getPasswordError(password);
  if (passwordError) errors.password = passwordError;
  if (formData.get("terms") !== "on") errors.terms = "Acepta los términos para crear tu cuenta.";

  if (Object.keys(errors).length > 0) {
    return { errors, fields };
  }

  // Cuentas creadas con éxito por IP: evita que alguien llene la base de talleres falsos.
  if (!takeRateLimit(`signup-ok:${ip}`, 3, 24 * HOUR_MS)) {
    return { message: "Ya se crearon varias cuentas desde esta conexión hoy. Inténtalo mañana.", fields };
  }

  try {
    if (await tooManyRecentSignups()) {
      return { message: "Estamos recibiendo muchos registros. Intenta más tarde.", fields };
    }
    const { tenantId, userId } = await createTenantWithOwner({
      name: fields.businessName,
      owner: { name: fields.name, email: fields.email, password },
      plan: "trial",
    });
    await createSession(userId, tenantId);
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { errors: { email: "Ya existe una cuenta con este correo. Inicia sesión." }, fields };
    }
    console.error("Error al crear la cuenta:", error);
    return { message: "No pudimos crear tu cuenta. Inténtalo más tarde.", fields };
  }

  redirect("/dashboard");
}
