"use client";

import { useEffect, useRef, useState } from "react";
import { ghostButtonClass } from "@/components/ui/form";

// Enlace público de seguimiento de la orden para compartirlo con el cliente.
export function TrackingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sin acceso al portapapeles (p. ej. por IP local sin HTTPS): copia con una selección temporal.
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900">Seguimiento del cliente</p>
        <p className="truncate text-xs text-zinc-500">{url}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={copy} className={ghostButtonClass} aria-live="polite">
          {copied ? "Copiado" : "Copiar enlace"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={ghostButtonClass}>
          Abrir
        </a>
      </div>
    </div>
  );
}
