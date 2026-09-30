import "server-only";
import { withTransaction } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import type { ModuleKey } from "@/lib/modules";

// Precios y días de prueba/gracia de la plataforma. Solo el administrador los cambia.
// Los precios nuevos aplican a checkouts nuevos y a módulos que se agreguen; las suscripciones
// vigentes conservan el precio de lo que ya pagan.

export type PricingInput = {
  trialDays: number;
  graceDays: number;
  baseCents: number;
  moduleCents: Record<ModuleKey, number>;
};

export async function updatePricing(input: PricingInput) {
  await requirePlatformAdmin();

  await withTransaction(async (client) => {
    await client.query(
      "UPDATE platform_settings SET trial_days = $1, grace_days = $2, base_price = $3::numeric / 100 WHERE id",
      [input.trialDays, input.graceDays, input.baseCents],
    );
    for (const [module, cents] of Object.entries(input.moduleCents)) {
      await client.query(
        `INSERT INTO module_prices (module, price) VALUES ($1, $2::numeric / 100)
         ON CONFLICT (module) DO UPDATE SET price = EXCLUDED.price`,
        [module, cents],
      );
    }
  });
}
