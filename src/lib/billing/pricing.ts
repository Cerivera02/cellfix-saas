import "server-only";
import { db } from "@/lib/db";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";

// Precios públicos de CellFix. Los usa la landing (sección de precios), el registro y la
// página de suscripción del taller. Los importes van en centavos para no perder precisión.
export type PublicPricing = {
  currency: string; // ISO 4217 en minúsculas, p. ej. "mxn"
  trialDays: number;
  graceDays: number;
  baseCents: number;
  modules: { key: ModuleKey; label: string; description: string; requires: ModuleKey[]; priceCents: number }[];
};

function toCents(value: string) {
  return Math.round(Number(value) * 100);
}

export async function getPublicPricing(): Promise<PublicPricing> {
  const [{ rows: settings }, { rows: prices }] = await Promise.all([
    db.query<{ trial_days: number; grace_days: number; currency: string; base_price: string }>(
      "SELECT trial_days, grace_days, currency, base_price FROM platform_settings WHERE id",
    ),
    db.query<{ module: string; price: string }>("SELECT module, price FROM module_prices"),
  ]);
  const setting = settings[0] ?? { trial_days: 30, grace_days: 7, currency: "mxn", base_price: "0" };
  const priceByModule = new Map(prices.map((row) => [row.module, toCents(row.price)]));

  return {
    currency: setting.currency,
    trialDays: setting.trial_days,
    graceDays: setting.grace_days,
    baseCents: toCents(setting.base_price),
    modules: MODULE_KEYS.map((key) => ({
      key,
      label: MODULES[key].label,
      description: MODULES[key].description,
      requires: MODULES[key].requires,
      priceCents: priceByModule.get(key) ?? 0,
    })),
  };
}

// Total mensual en centavos de la base más los módulos elegidos.
export function monthlyTotalCents(pricing: PublicPricing, modules: readonly ModuleKey[]) {
  return pricing.baseCents + pricing.modules.filter((m) => modules.includes(m.key)).reduce((sum, m) => sum + m.priceCents, 0);
}
