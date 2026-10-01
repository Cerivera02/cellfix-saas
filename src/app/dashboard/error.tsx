"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

// Errores dentro del panel del taller: el menú lateral sigue visible.
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} homeHref="/dashboard" />;
}
