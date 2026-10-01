import Link from "next/link";
import type { PublicPricing } from "@/lib/billing/pricing";
import { PricingCalculator } from "@/components/landing/pricing-calculator";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

// Precios sobre el tapete: la cotización es el papel que se deja en el banco de trabajo.
// Si los precios no se pudieron leer, la sección queda solo con la invitación a la prueba.
export function PricingSection({ pricing }: { pricing: PublicPricing | null }) {
  return (
    <section id="precios" className="scroll-mt-16 bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:112%] sm:text-4xl">
            Pagas la base y los módulos que usas
          </h2>
          <p className="mt-4 leading-relaxed text-zinc-400">
            {pricing
              ? `Prueba gratis ${pricing.trialDays} días con todos los módulos, sin tarjeta. Al terminar, te quedas con los que necesita tu taller y pagas cada mes.`
              : "Prueba gratis con todos los módulos, sin tarjeta. Al terminar, te quedas con los que necesita tu taller y pagas cada mes."}
          </p>
        </div>

        {pricing ? (
          <PricingCalculator pricing={pricing} />
        ) : (
          <Link
            href="/registro"
            className={`mt-9 inline-block rounded-lg bg-white px-5 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 ${focusRing}`}
          >
            Empieza tu prueba gratis
          </Link>
        )}
      </div>
    </section>
  );
}
