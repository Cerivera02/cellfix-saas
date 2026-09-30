"use client";

import { useEffect, useState } from "react";
import { PatternView } from "@/components/orders/unlock-view";

// Recorrido de ejemplo: el sello avanza una vez por estos estados y se queda en el último.
const TIMELINE = [
  { status: "Recibido", time: "10:12", who: "Mostrador" },
  { status: "En diagnóstico", time: "10:40", who: "Luis" },
  { status: "En reparación", time: "12:05", who: "Luis" },
  { status: "Listo para entregar", time: "13:30", who: "Luis" },
];

const STEP_MS = 1900;

export function ServiceTicket() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Con movimiento reducido se salta directo al último estado.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const last = TIMELINE.length - 1;
    const timer = window.setInterval(
      () => {
        setStep((current) => {
          const next = reduced ? last : Math.min(current + 1, last);
          if (next === last) window.clearInterval(timer);
          return next;
        });
      },
      reduced ? 0 : STEP_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const current = TIMELINE[step];

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none">
      {/* Textura de tinta irregular para el sello. */}
      <svg className="absolute size-0">
        <filter id="stamp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="2" />
        </filter>
      </svg>

      <div className="rotate-1 rounded-sm bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06),0_18px_40px_-12px_rgb(36_58_71/0.35)] ring-1 ring-zinc-200/80">
        <div className="relative px-6 pt-6 pb-5 sm:px-8">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
            <div>
              <p className="font-display text-[0.7rem] font-semibold tracking-[0.18em] text-zinc-500 uppercase [font-stretch:80%]">
                Orden de servicio
              </p>
              <p className="mt-1 font-body text-sm text-zinc-500">Taller El Chip · 30 sep</p>
            </div>
            <p className="font-folio text-2xl font-medium tracking-tight text-zinc-900">#1042</p>
          </div>

          <div className="relative">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 py-4 font-body text-sm">
              <dt className="text-zinc-500">Cliente</dt>
              <dd className="text-zinc-900">Mariana López</dd>
              <dt className="text-zinc-500">Equipo</dt>
              <dd className="text-zinc-900">iPhone 13 · Azul</dd>
              <dt className="text-zinc-500">Falla</dt>
              <dd className="text-zinc-900">Pantalla estrellada</dd>
              <dt className="text-zinc-500">Anticipo</dt>
              <dd className="font-folio text-zinc-900">$500.00</dd>
            </dl>

            {/* El sello cambia de estado; la key reinicia la animación en cada golpe. */}
            <div className="pointer-events-none absolute right-0 bottom-3">
              <p
                key={current.status}
                className="stamp rounded-md border-[3px] border-ink px-3 py-1.5 font-display text-lg leading-none font-extrabold tracking-wide text-ink uppercase outline-2 outline-offset-2 outline-ink [font-stretch:72%]"
              >
                {current.status}
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-zinc-200 pt-4">
            <div className="flex items-center gap-3">
              <PatternView dots={[1, 4, 5, 6, 9]} className="size-16" />
              <p className="font-body text-xs leading-snug text-zinc-500">
                Desbloqueo
                <span className="block font-folio text-zinc-700">1-4-5-6-9</span>
              </p>
            </div>
            <ol className="min-w-0 space-y-1 text-right font-folio text-[0.7rem] leading-tight text-zinc-500">
              {TIMELINE.slice(0, step + 1).map((entry) => (
                <li key={entry.status} className="log-in truncate">
                  {entry.time} {entry.who}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Las muescas toman el color de fondo del contenedor (--perf-bg). */}
        <div className="perforation" />

        <div className="flex items-center justify-between gap-4 px-6 pt-1 pb-5 sm:px-8">
          <p className="font-body text-xs leading-snug text-zinc-500">
            Talón del cliente
            <span className="block">Preséntalo para recoger tu equipo</span>
          </p>
          <p className="font-folio text-lg text-zinc-900">#1042</p>
        </div>
      </div>
    </div>
  );
}
