import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { tenantSchemaName, withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Evidencia fotográfica de las órdenes. Las fotos se suben desde un celular con un enlace
// temporal (código QR) sin iniciar sesión; los archivos se guardan en disco, por taller:
// <UPLOADS_DIR>/<schema del taller>/order-photos/<id>.<ext>

export const UPLOAD_SESSION_MINUTES = 30;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_SESSION = 20;
export const MAX_PHOTOS_PER_ORDER = 40;
// Fotos de recepciones que nunca se registraron como orden: se borran pasado este tiempo.
const ORPHAN_HOURS = 24;

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

type PhotoContentType = keyof typeof EXTENSIONS;

export type OrderPhoto = { id: string; createdAt: Date };

// Error con mensaje apto para la interfaz y el código HTTP para la subida desde el celular.
export class PhotoError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Carpeta en tiempo de ejecución: el bundler no debe intentar rastrear su contenido.
function uploadsRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.UPLOADS_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "uploads"),
  );
}

function photoDir(tenantId: string) {
  return path.join(/*turbopackIgnore: true*/ uploadsRoot(), tenantSchemaName(tenantId), "order-photos");
}

function photoPath(tenantId: string, fileName: string) {
  return path.join(/*turbopackIgnore: true*/ photoDir(tenantId), fileName);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// 32 bytes en base64url.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Tipo real de la imagen por sus primeros bytes; no se confía en lo que declara el navegador.
export function detectImageType(bytes: Uint8Array): PhotoContentType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

// Nombre del taller si existe y está activo. El enlace del celular trae el id del taller.
export async function getActiveTenantName(tenantId: string) {
  if (!UUID_PATTERN.test(tenantId)) return null;
  const { rows } = await db.query<{ name: string }>("SELECT name FROM tenants WHERE id = $1 AND status = 'active'", [
    tenantId,
  ]);
  return rows[0]?.name ?? null;
}

function isClosed(status: string | null) {
  return status === "delivered" || status === "cancelled";
}

export async function createUploadSession(tenantId: string, userId: string, orderId: string | null) {
  if (orderId !== null && !UUID_PATTERN.test(orderId)) throw new PhotoError("Solicitud no válida.");
  const token = randomBytes(32).toString("base64url");

  const { session, orphanFiles } = await withTenantDb(tenantId, async (client) => {
    if (orderId) {
      const { rows } = await client.query<{ status: string }>("SELECT status FROM repair_orders WHERE id = $1", [orderId]);
      if (!rows[0]) throw new PhotoError("La orden ya no existe.", 404);
      if (isClosed(rows[0].status)) throw new PhotoError("La orden ya está cerrada; no se le pueden agregar fotos.");
    }

    // Limpieza de fotos de recepciones abandonadas y de enlaces viejos.
    const { rows: orphans } = await client.query<{ file_name: string }>(
      `DELETE FROM order_photos
        WHERE order_id IS NULL AND created_at < now() - make_interval(hours => $1::int)
        RETURNING file_name`,
      [ORPHAN_HOURS],
    );
    await client.query("DELETE FROM photo_upload_sessions WHERE expires_at < now() - make_interval(hours => $1::int)", [
      ORPHAN_HOURS,
    ]);

    const { rows } = await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO photo_upload_sessions (token_hash, order_id, created_by, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))
       RETURNING id, expires_at`,
      [hashToken(token), orderId, userId, UPLOAD_SESSION_MINUTES],
    );
    return { session: rows[0], orphanFiles: orphans.map((row) => row.file_name) };
  });

  await Promise.all(orphanFiles.map((fileName) => unlink(photoPath(tenantId, fileName)).catch(() => {})));

  return { sessionId: session.id, token, expiresAt: session.expires_at };
}

// Enlace vigente para la página del celular, o null si no existe, caducó o la orden se cerró.
export async function getUploadSession(tenantId: string, token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{
      expires_at: Date;
      folio: number | null;
      device_type: string | null;
      brand: string | null;
      model: string | null;
      status: string | null;
      photo_count: number;
    }>(
      `SELECT s.expires_at, o.folio::int AS folio, o.device_type, o.brand, o.model, o.status,
              (SELECT count(*)::int FROM order_photos p WHERE p.session_id = s.id) AS photo_count
         FROM photo_upload_sessions s
         LEFT JOIN repair_orders o ON o.id = s.order_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row || isClosed(row.status)) return null;

    return {
      expiresAt: row.expires_at,
      photoCount: row.photo_count,
      orderLabel:
        row.folio === null
          ? null
          : `Orden #${row.folio} · ${[row.device_type, row.brand, row.model].filter(Boolean).join(" ")}`,
    };
  });
}

// Guarda una foto subida con el enlace. Escribe el archivo y lo registra en la misma operación:
// si el registro falla, el archivo se borra.
export async function savePhoto(tenantId: string, token: string, bytes: Uint8Array) {
  if (!TOKEN_PATTERN.test(token)) throw new PhotoError("El enlace no es válido.", 404);
  if (bytes.length === 0) throw new PhotoError("La foto está vacía.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError("La foto pesa demasiado (máximo 10 MB).", 413);
  const contentType = detectImageType(bytes);
  if (!contentType) throw new PhotoError("Formato no compatible: usa JPG, PNG o WebP.", 415);

  const id = randomUUID();
  const fileName = `${id}.${EXTENSIONS[contentType]}`;
  const filePath = photoPath(tenantId, fileName);

  try {
    return await withTenantDb(tenantId, async (client) => {
      // Bloquea el enlace: las subidas simultáneas respetan los límites.
      const { rows } = await client.query<{ id: string; order_id: string | null; status: string | null }>(
        `SELECT s.id, s.order_id, o.status
           FROM photo_upload_sessions s
           LEFT JOIN repair_orders o ON o.id = s.order_id
          WHERE s.token_hash = $1 AND s.expires_at > now()
            FOR UPDATE OF s`,
        [hashToken(token)],
      );
      const session = rows[0];
      if (!session) throw new PhotoError("El enlace ya caducó. Pide que generen un nuevo código QR.", 410);
      if (isClosed(session.status)) throw new PhotoError("La orden ya está cerrada.", 409);

      const { rows: countRows } = await client.query<{ session_count: number; order_count: number }>(
        `SELECT (SELECT count(*)::int FROM order_photos WHERE session_id = $1) AS session_count,
                (SELECT count(*)::int FROM order_photos WHERE order_id = $2) AS order_count`,
        [session.id, session.order_id],
      );
      if (countRows[0].session_count >= MAX_PHOTOS_PER_SESSION) {
        throw new PhotoError(`Con este código se pueden subir hasta ${MAX_PHOTOS_PER_SESSION} fotos.`, 409);
      }
      if (countRows[0].order_count >= MAX_PHOTOS_PER_ORDER) {
        throw new PhotoError(`La orden ya tiene el máximo de ${MAX_PHOTOS_PER_ORDER} fotos.`, 409);
      }

      await mkdir(photoDir(tenantId), { recursive: true });
      await writeFile(filePath, bytes, { flag: "wx" });
      await client.query(
        `INSERT INTO order_photos (id, session_id, order_id, file_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, session.id, session.order_id, fileName, contentType, bytes.length],
      );
      return { id };
    });
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }
}

// Al registrar la orden, las fotos subidas durante la recepción quedan ligadas a ella.
export async function attachUploadSession(client: PoolClient, sessionId: string, orderId: string) {
  await client.query("UPDATE photo_upload_sessions SET order_id = $1 WHERE id = $2 AND order_id IS NULL", [
    orderId,
    sessionId,
  ]);
  await client.query("UPDATE order_photos SET order_id = $1 WHERE session_id = $2 AND order_id IS NULL", [
    orderId,
    sessionId,
  ]);
}

export async function listPhotos(
  tenantId: string,
  filter: { orderId: string } | { sessionIds: string[] },
): Promise<OrderPhoto[]> {
  const byOrder = "orderId" in filter;
  const ids = byOrder ? [filter.orderId] : filter.sessionIds;
  if (ids.length === 0 || ids.length > 20 || ids.some((id) => !UUID_PATTERN.test(id))) return [];

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ id: string; created_at: Date }>(
      byOrder
        ? "SELECT id, created_at FROM order_photos WHERE order_id = $1 ORDER BY created_at"
        : "SELECT id, created_at FROM order_photos WHERE session_id = ANY($1::uuid[]) ORDER BY created_at",
      [byOrder ? ids[0] : ids],
    );
    return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
  });
}

export async function readPhoto(tenantId: string, photoId: string) {
  if (!UUID_PATTERN.test(photoId)) return null;

  const photo = await withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ file_name: string; content_type: string }>(
      "SELECT file_name, content_type FROM order_photos WHERE id = $1",
      [photoId],
    );
    return rows[0] ?? null;
  });
  if (!photo) return null;

  try {
    return { bytes: await readFile(photoPath(tenantId, photo.file_name)), contentType: photo.content_type };
  } catch {
    return null;
  }
}

// La evidencia de órdenes cerradas no se borra.
export async function deletePhoto(tenantId: string, photoId: string) {
  if (!UUID_PATTERN.test(photoId)) throw new PhotoError("Solicitud no válida.");

  const fileName = await withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ file_name: string; status: string | null }>(
      `SELECT p.file_name, o.status
         FROM order_photos p
         LEFT JOIN repair_orders o ON o.id = p.order_id
        WHERE p.id = $1
          FOR UPDATE OF p`,
      [photoId],
    );
    if (!rows[0]) return null;
    if (isClosed(rows[0].status)) throw new PhotoError("La orden ya está cerrada; su evidencia no se puede borrar.");
    await client.query("DELETE FROM order_photos WHERE id = $1", [photoId]);
    return rows[0].file_name;
  });

  if (fileName) await unlink(photoPath(tenantId, fileName)).catch(() => {});
}
