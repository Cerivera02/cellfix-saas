"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

// Errores de las páginas públicas (landing, registro, seguimiento…).
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
