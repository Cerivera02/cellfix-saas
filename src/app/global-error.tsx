"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/ui/error-screen";

// Último recurso: errores en el layout raíz. Reemplaza todo el documento, por eso lleva html y body.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body className="bg-white text-zinc-900 antialiased">
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
