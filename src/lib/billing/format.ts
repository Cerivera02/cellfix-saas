// Formato de importes en centavos, p. ej. 29900 → "$299.00". Sirve en servidor y cliente.
export function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}
