"use client";

import { useEffect, useRef, useState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";

type Upload = { key: number; preview: string; status: "uploading" | "done" | "error"; message?: string };

const MAX_SIDE = 1600;

// Reduce la foto antes de subirla (menos datos móviles) y la convierte a JPEG, lo que también
// resuelve formatos como HEIC. Si el navegador no puede procesarla, se sube tal cual.
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
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
        body.append("photo", await compress(file), "foto.jpg");
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
