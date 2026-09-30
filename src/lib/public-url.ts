import "server-only";
import { headers } from "next/headers";

// URL pública de la app para enlaces que se abren fuera de la sesión (códigos QR, seguimiento):
// APP_URL si está definida o la del navegador que hizo la petición.
export async function publicBaseUrl() {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
