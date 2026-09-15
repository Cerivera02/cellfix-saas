"use client";

import { useEffect, useId, useRef } from "react";
import { NavIcon } from "@/components/shell/nav-icon";

// Ventana modal sobre <dialog>: el navegador gestiona el foco, Escape y el fondo.
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Un clic en el fondo (fuera del contenido) cierra la ventana.
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size === "lg" ? "max-w-lg" : "max-w-md"} rounded-2xl border border-zinc-200 bg-white p-0 text-left text-zinc-900 shadow-xl backdrop:bg-zinc-900/30`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <NavIcon name="close" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}
