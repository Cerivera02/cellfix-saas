import Link from "next/link";
import { brandFonts } from "@/app/fonts";
import { ServiceTicket } from "@/components/landing/service-ticket";

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-md bg-white font-display text-xs font-bold text-mat">
        CF
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-white [font-stretch:112%]">CellFix</span>
    </span>
  );
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${brandFonts} grid flex-1 grid-rows-[auto_1fr] font-body lg:grid-cols-[1.05fr_1fr] lg:grid-rows-1`}>
      {/* Panel de marca: tapete antiestático con la orden de servicio. En móvil queda como franja. */}
      <aside className="mat-grid flex flex-col px-4 py-5 text-white [--perf-bg:var(--color-mat)] sm:px-8 lg:min-h-dvh lg:px-12 lg:py-10">
        <Link href="/" className={`self-start rounded-md ${focusRing} focus-visible:outline-white`}>
          <BrandMark />
        </Link>

        <div className="hidden flex-1 items-center justify-center py-12 lg:flex">
          <ServiceTicket />
        </div>

        <p className="hidden max-w-sm text-sm leading-relaxed text-mat-text lg:block">
          Órdenes, caja e inventario de tu taller, en el mismo lugar donde los dejaste.
        </p>
      </aside>

      <main className="flex flex-col bg-zinc-50 px-4 py-8 sm:px-8 lg:px-12 lg:py-6">
        <div className="flex justify-end">
          <Link href="/" className={`rounded text-sm text-zinc-500 hover:text-zinc-900 ${focusRing}`}>
            Volver al inicio
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
