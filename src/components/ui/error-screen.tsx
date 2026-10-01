"use client";

import Link from "next/link";
import { useEffect } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import { TOO_MANY_REQUESTS_MESSAGE } from "@/lib/rate-limit/limits";

// Pantalla de error en español para los error.tsx de la app. Distingue el límite de solicitudes
// (el proxy responde 429 y la Server Action llega como error con ese mensaje) de un error inesperado.
export function ErrorScreen({
  error,
  retry,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const rateLimited = error.message?.includes(TOO_MANY_REQUESTS_MESSAGE.split(".")[0]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-folio text-sm text-zinc-400">{rateLimited ? "429" : "Error"}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {rateLimited ? "Demasiadas solicitudes" : "Algo salió mal"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        {rateLimited
          ? "Recibimos muchas solicitudes desde tu conexión en poco tiempo. Espera un minuto y vuelve a intentarlo."
          : "No pudimos completar lo que pediste. Inténtalo de nuevo; si el problema sigue, recarga la página."}
      </p>
      {error.digest && !rateLimited && (
        <p className="mt-2 font-folio text-xs text-zinc-400">Referencia: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={primaryButtonClass}>
          Intentar de nuevo
        </button>
        <Link href={homeHref} className={secondaryButtonClass}>
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
