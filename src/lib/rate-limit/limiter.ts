import { defaultStore, type RateLimitStore } from "./store";

export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  // Segundos hasta que se reinicia la ventana; 0 si la solicitud pasó.
  retryAfterSeconds: number;
};

function toResult(count: number, resetAt: number, limit: number, allowed: boolean): RateLimitResult {
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

// Límite con nombre (prefijo de las claves) y regla fija. Uso: limiter.consume(ip).
export function createRateLimiter(name: string, rule: RateLimitRule, store: RateLimitStore = defaultStore()) {
  const keyFor = (id: string) => `${name}:${id}`;

  return {
    // Cuenta un golpe y dice si cabe dentro del límite.
    async consume(id: string): Promise<RateLimitResult> {
      const { count, resetAt } = await store.increment(keyFor(id), rule.windowMs);
      return toResult(count, resetAt, rule.limit, count <= rule.limit);
    },
    // Revisa sin contar (p. ej. intentos fallidos: solo se cuentan después de fallar).
    async check(id: string): Promise<RateLimitResult> {
      const entry = await store.get(keyFor(id));
      if (!entry) return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
      return toResult(entry.count, entry.resetAt, rule.limit, entry.count < rule.limit);
    },
    async reset(id: string) {
      await store.reset(keyFor(id));
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
