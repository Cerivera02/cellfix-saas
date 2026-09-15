import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Parámetros recomendados por OWASP para scrypt. Se guardan dentro del hash,
// así que se pueden endurecer después sin invalidar contraseñas existentes.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });
  return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelism, salt, key] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const expected = Buffer.from(key, "base64");
  const actual = await deriveKey(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelism),
  });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

// Hash de relleno: un correo inexistente tarda lo mismo que uno registrado.
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
