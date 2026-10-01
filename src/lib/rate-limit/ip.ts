// Cuántos proxies de confianza hay delante de la app (TRUST_PROXY_HOPS, por omisión 1).
function trustedHops() {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  return Number.isInteger(hops) && hops >= 0 && hops <= 10 ? hops : 1;
}

// IP del cliente. Cada proxy agrega a la DERECHA de x-forwarded-for la IP que lo contactó, así
// que lo de la izquierda lo puede inventar el cliente: se toma la entrada que está tantos saltos
// desde la derecha como proxies de confianza haya. Si no alcanza, x-real-ip; si no, "desconocida".
// Sin dependencias de Next para poder usarse también en el proxy.
export function clientIpFromHeaders(requestHeaders: Headers) {
  const hops = trustedHops();
  const entries = (requestHeaders.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (hops > 0 && entries.length >= hops) return entries[entries.length - hops];
  return requestHeaders.get("x-real-ip")?.trim() || "desconocida";
}
