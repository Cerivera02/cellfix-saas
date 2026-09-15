// Crea o actualiza el administrador de la plataforma (acceso a /admin).
//
//   npm run admin:create
//
// Lee del entorno (.env.local): ADMIN_EMAIL, ADMIN_PASSWORD y opcionalmente ADMIN_NAME.
// Es idempotente: si el correo ya existe, actualiza la contraseña, lo marca como
// administrador y cierra sus sesiones abiertas.

import { randomBytes, scrypt } from "node:crypto";
import { connect } from "./lib/db.mjs";

// Mismo formato y parámetros que src/lib/auth/password.ts: scrypt$N$r$p$salt$hash
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY },
      (error, key) =>
        error
          ? reject(error)
          : resolve(["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), key.toString("base64")].join("$")),
    );
  });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "").trim() || "Administrador";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Define ADMIN_EMAIL con un correo válido.");
  }
  if (!password || password.length > 128) {
    throw new Error("Define ADMIN_PASSWORD (máximo 128 caracteres).");
  }

  const passwordHash = await hashPassword(password);
  const client = await connect();

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, is_platform_admin)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, is_platform_admin = true
       RETURNING id, (xmax = 0) AS created`,
      [name, email, passwordHash],
    );
    const { id, created } = rows[0];
    if (!created) {
      await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    }
    await client.query("COMMIT");

    console.log(
      created
        ? `✓ Administrador creado: ${email}`
        : `✓ Administrador actualizado: ${email} (se cerraron sus sesiones abiertas)`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "42P01" || error.code === "42703") {
      throw new Error("Faltan migraciones. Ejecuta primero: npm run db:migrate", { cause: error });
    }
    throw error;
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
