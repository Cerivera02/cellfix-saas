import type { RateLimitRule } from "./limiter";

// Todos los límites de solicitudes de la app en un solo lugar.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Entero positivo desde el entorno, o el valor por omisión si falta o no es válido.
function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// ─── Límite global en el proxy (POST/PUT/PATCH/DELETE por IP) ───
// Solo frena abusos: un 429 en una Server Action rompe la pantalla (el cliente lanza un error),
// así que es holgado (un taller con varios empleados puede compartir IP). La experiencia normal
// la cuidan los límites de cada formulario, más abajo.
export const PROXY_LIMITS = {
  general: { limit: envLimit("RATE_LIMIT_POST_PER_MINUTE", 120), windowMs: MINUTE_MS },
  // Subidas de fotos desde el celular: ráfagas seguidas, con su propia cubeta.
  evidence: { limit: envLimit("RATE_LIMIT_EVIDENCE_PER_MINUTE", 120), windowMs: MINUTE_MS },
} satisfies Record<string, RateLimitRule>;

// ─── Inicio de sesión: intentos FALLIDOS ───
export const LOGIN_FAILURES_PER_EMAIL: RateLimitRule = { limit: 5, windowMs: 15 * MINUTE_MS };
export const LOGIN_FAILURES_PER_IP: RateLimitRule = { limit: 20, windowMs: 15 * MINUTE_MS };

// ─── Registro público ───
export const SIGNUP_ATTEMPTS_PER_IP: RateLimitRule = { limit: 10, windowMs: HOUR_MS };
export const SIGNUPS_PER_IP: RateLimitRule = { limit: 3, windowMs: 24 * HOUR_MS };

// ─── Formulario de contacto del landing ───
export const LEADS_PER_IP: RateLimitRule = { limit: 5, windowMs: HOUR_MS };

export const TOO_MANY_REQUESTS_MESSAGE = "Demasiadas solicitudes. Intenta de nuevo en unos minutos.";
