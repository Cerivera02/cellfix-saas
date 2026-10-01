// Almacén de contadores para los límites de solicitudes.
//
// Ventana fija: cada clave guarda cuántos golpes lleva y cuándo se reinicia su ventana. Es O(1) en
// memoria por clave; a cambio, en el borde entre dos ventanas puede pasar hasta el doble del límite,
// lo que basta para frenar abusos.
//
// La interfaz es asíncrona a propósito para poder cambiar la memoria por un almacén compartido:
// - Redis: increment = MULTI { INCR clave; PEXPIRE clave windowMs NX; PTTL clave } → resetAt = now + pttl.
//   get = GET + PTTL; reset = DEL.
// - Postgres: tabla rate_limits(key text primary key, count int, reset_at timestamptz) e
//   INSERT … ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.reset_at <= now()
//   THEN 1 ELSE rate_limits.count + 1 END, reset_at = CASE … END RETURNING count, reset_at;
//   y un borrado periódico de filas vencidas.
// Basta con implementar RateLimitStore y pasarlo a createRateLimiter (o cambiar defaultStore()).

export type RateLimitEntry = { count: number; resetAt: number };

export interface RateLimitStore {
  // Suma un golpe a la clave (abriendo una ventana nueva si no hay o ya venció) y devuelve el estado.
  increment(key: string, windowMs: number): Promise<RateLimitEntry>;
  // Estado actual sin sumar nada; null si no hay ventana vigente.
  get(key: string): Promise<RateLimitEntry | null>;
  reset(key: string): Promise<void>;
}

type MemoryStoreOptions = { maxKeys?: number; cleanupIntervalMs?: number };

// Almacén en la memoria del proceso. Con varias instancias cada una cuenta por su lado.
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly maxKeys: number;

  constructor({ maxKeys = 10_000, cleanupIntervalMs = 60_000 }: MemoryStoreOptions = {}) {
    this.maxKeys = maxKeys;
    // Limpieza periódica de ventanas vencidas; unref para no mantener vivo el proceso.
    const timer = setInterval(() => this.sweep(), cleanupIntervalMs);
    (timer as { unref?: () => void }).unref?.();
  }

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const current = this.entries.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      return { ...current };
    }

    // Ventana nueva: se borra y se vuelve a insertar para que el orden del Map siga el de
    // apertura de ventanas (las primeras son las que vencen antes).
    this.entries.delete(key);
    if (this.entries.size >= this.maxKeys) this.makeRoom(now);
    const entry = { count: 1, resetAt: now + windowMs };
    this.entries.set(key, entry);
    return { ...entry };
  }

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.resetAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return { ...entry };
  }

  async reset(key: string) {
    this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }

  private sweep(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }

  // Tope de tamaño: primero se tiran las vencidas; si aún no cabe, las ventanas más antiguas.
  private makeRoom(now: number) {
    this.sweep(now);
    for (const key of this.entries.keys()) {
      if (this.entries.size < this.maxKeys) break;
      this.entries.delete(key);
    }
  }
}

// Un solo almacén por proceso (o por contexto del proxy), que sobrevive a la recarga en desarrollo.
const globalForStore = globalThis as typeof globalThis & { cellfixRateLimitStore?: RateLimitStore };

export function defaultStore(): RateLimitStore {
  return (globalForStore.cellfixRateLimitStore ??= new MemoryRateLimitStore());
}
