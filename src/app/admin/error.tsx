"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

// Errores dentro del panel administrativo: el menú lateral sigue visible.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} homeHref="/admin" />;
}
