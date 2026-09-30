import "server-only";
import { headers } from "next/headers";

// Límite de intentos por clave en una ventana de tiempo, en memoria del proceso.
// Basta para frenar abusos simples en un solo servidor; con varias instancias cada una cuenta aparte.
const globalForLimits = globalThis as typeof globalThis & { cellfixRateLimits?: Map<string, number[]> };
const hits = (globalForLimits.cellfixRateLimits ??= new Map<string, number[]>());

// Registra un intento y devuelve false si ya se pasó del límite.
export function takeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Limpieza ocasional para que el mapa no crezca sin fin.
  if (hits.size > 5000) {
    for (const [otherKey, times] of hits) {
      if (times.every((time) => now - time >= windowMs)) hits.delete(otherKey);
    }
  }
  return true;
}

// Cuántos proxies de confianza hay delante de la app (TRUST_PROXY_HOPS, por omisión 1).
function trustedHops() {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  return Number.isInteger(hops) && hops >= 0 && hops <= 10 ? hops : 1;
}

// IP del cliente. Cada proxy agrega a la DERECHA de x-forwarded-for la IP que lo contactó, así
// que lo de la izquierda lo puede inventar el cliente: se toma la entrada que está tantos saltos
// desde la derecha como proxies de confianza haya. Si no alcanza, x-real-ip; si no, "desconocida".
export async function clientIp() {
  const requestHeaders = await headers();
  const hops = trustedHops();
  const entries = (requestHeaders.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (hops > 0 && entries.length >= hops) return entries[entries.length - hops];
  return requestHeaders.get("x-real-ip")?.trim() || "desconocida";
}
