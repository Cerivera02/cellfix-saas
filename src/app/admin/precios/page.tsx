import type { Metadata } from "next";
import { PricingForm } from "@/components/admin/pricing-form";
import { updatePricingAction } from "@/lib/admin/actions";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getPublicPricing } from "@/lib/billing/pricing";
import type { ModuleKey } from "@/lib/modules";

export const metadata: Metadata = {
  title: "Precios — Panel administrativo — CellFix",
};

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

export default async function PricingPage() {
  await requirePlatformAdmin();
  const pricing = await getPublicPricing();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Precios y prueba gratuita</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">
        Se muestran en la página principal y en el registro. Los precios nuevos aplican a quien se suscriba o agregue
        un módulo a partir de ahora; las suscripciones vigentes conservan su precio.
      </p>

      <section className="mt-8 max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6">
        <PricingForm
          currency={pricing.currency}
          action={updatePricingAction}
          defaults={{
            trialDays: String(pricing.trialDays),
            graceDays: String(pricing.graceDays),
            basePrice: centsToInput(pricing.baseCents),
            modulePrices: Object.fromEntries(
              pricing.modules.map((module) => [module.key, centsToInput(module.priceCents)]),
            ) as Record<ModuleKey, string>,
          }}
        />
      </section>
    </>
  );
}
