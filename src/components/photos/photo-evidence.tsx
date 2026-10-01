"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { secondaryButtonClass, ghostButtonClass } from "@/components/ui/form";
import { createPhotoSessionAction, deletePhotoAction, listPhotosAction, type PhotoSession } from "@/lib/photos/actions";

// Fotos de evidencia de una orden y código QR para subirlas desde un celular.
// Sin `orderId` (recepción) las fotos quedan en los enlaces generados y se ligan a la orden al
// registrarla: sus ids viajan en el formulario como `sessionInputName`.
export function PhotoEvidence({
  orderId,
  initialPhotos,
  canUpload,
  canDelete,
  sessionInputName,
}: {
  orderId: string | null;
  initialPhotos: { id: string }[];
  canUpload: boolean;
  canDelete: boolean;
  sessionInputName?: string;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [session, setSession] = useState<PhotoSession | null>(null);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Foto que espera confirmación para borrarse.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Mientras el código está vigente, revisa cada 3 segundos si llegaron fotos nuevas.
  useEffect(() => {
    if (!session) return;
    const expiresAt = new Date(session.expiresAt).getTime();
    const filter = orderId ? { orderId } : { sessionIds };

    const timer = setInterval(async () => {
      try {
        setPhotos(await listPhotosAction(filter));
      } catch {
        // Un fallo de red momentáneo no interrumpe la revisión.
      }
      if (Date.now() > expiresAt) {
        clearInterval(timer);
        setSession(null);
        setExpired(true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [session, sessionIds, orderId]);

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPhotoSessionAction(orderId);
      if ("message" in result) {
        setError(result.message);
        return;
      }
      setSession(result);
      setSessionIds((current) => [...current, result.sessionId]);
      setExpired(false);
    });
  };

  const remove = (photoId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deletePhotoAction(photoId);
      if (result.message) setError(result.message);
      else setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    });
  };

  const isLocalhost = session !== null && /:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(session.url);

  return (
    <div>
      {sessionInputName &&
        sessionIds.map((sessionId) => <input key={sessionId} type="hidden" name={sessionInputName} value={sessionId} />)}

      {photos.length === 0 ? (
        <p className="text-sm text-zinc-500">Sin fotos todavía.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
              <a href={`/api/orders/photos/${photo.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida por una ruta con sesión */}
                <img
                  src={`/api/orders/photos/${photo.id}`}
                  alt={`Evidencia ${index + 1}`}
                  loading="lazy"
                  className="size-full object-cover transition hover:opacity-90"
                />
              </a>
              {canDelete && (
                <button
                  type="button"
                  aria-label={`Borrar evidencia ${index + 1}`}
                  disabled={pending}
                  onClick={() => setConfirmingId(photo.id)}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-white/90 text-sm text-zinc-700 shadow-sm transition hover:bg-red-50 hover:text-red-600"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && session && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR generado como data URL */}
          <img src={session.qr} alt="Código QR para subir fotos desde el celular" className="size-40 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-zinc-900">Escanéalo con el celular</p>
            <p className="mt-1 text-sm text-zinc-600">
              Las fotos aparecen aquí solas. Válido hasta las{" "}
              {new Date(session.expiresAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}.
            </p>
            {isLocalhost && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El celular no puede abrir “localhost”. Entra a CellFix con la IP de esta computadora o define APP_URL.
              </p>
            )}
            <p className="mt-2 text-xs break-all text-zinc-400">{session.url}</p>
            <button type="button" onClick={() => setSession(null)} className={`mt-2 ${ghostButtonClass}`}>
              Ocultar código
            </button>
          </div>
        </div>
      )}

      {canUpload && !session && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={generate} disabled={pending} className={secondaryButtonClass}>
            {pending ? "Generando…" : "Subir fotos con el celular"}
          </button>
          {expired && <span className="text-xs text-zinc-500">El código anterior caducó; genera otro si hace falta.</span>}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirmingId !== null}
        message="¿Borrar esta foto?"
        confirmLabel="Borrar"
        onCancel={() => setConfirmingId(null)}
        onConfirm={() => {
          if (confirmingId) remove(confirmingId);
          setConfirmingId(null);
        }}
      />
    </div>
  );
}
