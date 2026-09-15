"use client";

import { primaryButtonClass } from "@/components/ui/form";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`print:hidden ${primaryButtonClass}`}>
      {label}
    </button>
  );
}
