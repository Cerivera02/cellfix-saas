"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { NavIcon } from "@/components/shell/nav-icon";
import { Sidebar, type SidebarProps } from "@/components/shell/sidebar";

export function MobileNav(props: SidebarProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden print:hidden">
        <Logo />
        <button
          type="button"
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
        >
          <NavIcon name="menu" />
        </button>
      </header>

      <div className={`fixed inset-0 z-40 lg:hidden print:hidden ${open ? "" : "pointer-events-none"}`} inert={!open}>
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-zinc-900/30 transition-opacity duration-300 motion-reduce:transition-none ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className={`absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-3 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <NavIcon name="close" />
          </button>
          <Sidebar {...props} onNavigate={() => setOpen(false)} />
        </aside>
      </div>
    </>
  );
}
