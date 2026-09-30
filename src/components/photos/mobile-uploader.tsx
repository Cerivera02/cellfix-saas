"use client";

import { useEffect, useRef, useState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";

type Upload = { key: number; preview: string; status: "uploading" | "done" | "error"; message?: string };

// Pasadas de compresión: se usa la primera que quede bajo TARGET_BYTES. Con 1600 px se
// alcanzan a leer rayones, números de serie y etiquetas.
const PASSES = [
  { maxSide: 1600, quality: 0.8 },
  { maxSide: 1600, quality: 0.68 },
  { maxSide: 1280, quality: 0.62 },
];
const TARGET_BYTES = 450 * 1024;

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

// Reduce la foto antes de subirla para ocupar solo el espacio necesario. Prefiere WebP
// (más ligero con la misma calidad) y cae a JPEG donde el navegador no sabe generarlo,
// como Safari en iPhone. Convertir también resuelve formatos como HEIC. Si el navegador
// no puede procesarla, se sube tal cual.
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    let best: Blob | null = null;

    for (const pass of PASSES) {
      const scale = Math.min(1, pass.maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      // toBlob devuelve PNG cuando no soporta el tipo pedido: se revisa el tipo real.
      let blob = await encode(canvas, "image/webp", pass.quality);
      if (blob?.type !== "image/webp") blob = await encode(canvas, "image/jpeg", pass.quality);
      if (blob && (!best || blob.size < best.size)) best = blob;
      if (best && best.size <= TARGET_BYTES) break;
    }

    bitmap.close();
    canvas.width = canvas.height = 0;

    // Siempre se sube la versión redibujada, aunque el original pese menos: redibujar descarta
    // los metadatos (ubicación GPS, modelo del celular) que el cliente podría ver en el seguimiento.
    return best ?? file;
  } catch {
    return file;
  }
}

function fileNameFor(blob: Blob) {
  return blob.type === "image/webp" ? "foto.webp" : blob.type === "image/png" ? "foto.png" : "foto.jpg";
}

export function MobileUploader({ uploadUrl, initialCount }: { uploadUrl: string; initialCount: number }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const nextKey = useRef(0);
  const previews = useRef<string[]>([]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const update = (key: number, patch: Partial<Upload>) =>
    setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)));

  // Sube una por una para no saturar la conexión del celular.
  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      const key = nextKey.current++;
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setUploads((current) => [{ key, preview, status: "uploading" }, ...current]);

      try {
        const body = new FormData();
        const photo = await compress(file);
        body.append("photo", photo, fileNameFor(photo));
        const response = await fetch(uploadUrl, { method: "POST", body });
        const result = (await response.json().catch(() => ({}))) as { message?: string };
        update(key, response.ok ? { status: "done" } : { status: "error", message: result.message ?? "No se pudo subir." });
      } catch {
        update(key, { status: "error", message: "Sin conexión. Intenta de nuevo." });
      }
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files);
  };

  const done = initialCount + uploads.filter((upload) => upload.status === "done").length;
  const uploading = uploads.some((upload) => upload.status === "uploading");

  return (
    <>
      <div className="mt-6 grid gap-3">
        <label className={`${primaryButtonClass} flex cursor-pointer justify-center py-3.5 text-base`}>
          Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" />
        </label>
        <label className={`${secondaryButtonClass} flex cursor-pointer justify-center py-3.5 text-base`}>
          Elegir de la galería
          <input type="file" accept="image/*" multiple onChange={onPick} className="sr-only" />
        </label>
      </div>

      <p aria-live="polite" className="mt-5 text-sm text-zinc-600">
        {uploading ? "Subiendo…" : done === 0 ? "Aún no hay fotos." : done === 1 ? "1 foto subida." : `${done} fotos subidas.`}
      </p>

      {uploads.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {uploads.map((upload) => (
            <li key={upload.key} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={upload.preview} alt="" className="size-full object-cover" />
              {upload.status !== "done" && (
                <span
                  className={`absolute inset-0 flex items-center justify-center p-1.5 text-center text-xs font-medium ${
                    upload.status === "uploading" ? "bg-white/60 text-zinc-900" : "bg-red-600/85 text-white"
                  }`}
                >
                  {upload.status === "uploading" ? "Subiendo…" : upload.message}
                </span>
              )}
              {upload.status === "done" && (
                <span className="absolute right-1 bottom-1 rounded-full bg-emerald-600 px-1.5 text-xs font-medium text-white">
                  ✓
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
