"use server";

import { headers } from "next/headers";
import { toDataURL } from "qrcode";
import { requireAnyTenantPermission } from "@/lib/auth/session";
import { hasModule } from "@/lib/modules";
import { ORDER_ACCESS_PERMISSIONS } from "@/lib/orders/labels";
import { PhotoError, createUploadSession, deletePhoto, listPhotos } from "@/lib/photos/core";

// Acciones de la evidencia fotográfica. Generar el código y borrar fotos lo hacen recepción y técnicos.

export type PhotoSession = { sessionId: string; url: string; qr: string; expiresAt: string };

// URL con la que el celular abre el enlace: APP_URL si está definida o la del navegador actual.
async function publicBaseUrl() {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function createPhotoSessionAction(orderId: string | null): Promise<PhotoSession | { message: string }> {
  const session = await requireAnyTenantPermission(["orders.intake", "repairs.work"]);
  if (!hasModule(session.modules, "photos")) return { message: "La evidencia fotográfica no está activa en este taller." };

  try {
    const upload = await createUploadSession(
      session.tenant.id,
      session.user.id,
      typeof orderId === "string" ? orderId : null,
    );
    const url = `${await publicBaseUrl()}/evidencia/${session.tenant.id}/${upload.token}`;
    return {
      sessionId: upload.sessionId,
      url,
      qr: await toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }),
      expiresAt: upload.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof PhotoError) return { message: error.message };
    console.error("Error al generar el código de fotos:", error);
    return { message: "No pudimos generar el código. Inténtalo de nuevo." };
  }
}

export async function listPhotosAction(filter: { orderId: string } | { sessionIds: string[] }) {
  const session = await requireAnyTenantPermission(ORDER_ACCESS_PERMISSIONS);
  if (!hasModule(session.modules, "photos")) return [];
  const safeFilter =
    typeof filter === "object" && filter !== null && "orderId" in filter
      ? { orderId: String(filter.orderId) }
      : { sessionIds: Array.isArray(filter?.sessionIds) ? filter.sessionIds.map(String) : [] };
  const photos = await listPhotos(session.tenant.id, safeFilter);
  return photos.map((photo) => ({ id: photo.id }));
}

export async function deletePhotoAction(photoId: string): Promise<{ message?: string }> {
  const session = await requireAnyTenantPermission(["orders.intake", "repairs.work"]);
  // Con el módulo apagado las fotos se conservan tal cual.
  if (!hasModule(session.modules, "photos")) return { message: "La evidencia fotográfica no está activa en este taller." };
  try {
    await deletePhoto(session.tenant.id, String(photoId));
    return {};
  } catch (error) {
    if (error instanceof PhotoError) return { message: error.message };
    console.error("Error al borrar la foto:", error);
    return { message: "No pudimos borrar la foto. Inténtalo de nuevo." };
  }
}
