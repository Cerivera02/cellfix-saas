import nextEnv from "@next/env";
import pg from "pg";

// Carga los .env* igual que Next: .env.development(.local) o .env.production(.local) según NODE_ENV.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export async function connect() {
  const missing = ["DB_HOST", "DB_USER", "DB_NAME"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de la base de datos: ${missing.join(", ")}. Agrégalas a .env.local (revisa .env.example).`);
  }

  const client = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });

  try {
    await client.connect();
  } catch (error) {
    if (error.code === "3D000") {
      throw new Error(`La base de datos "${process.env.DB_NAME}" no existe. Créala primero: CREATE DATABASE ${process.env.DB_NAME};`);
    }
    throw error;
  }
  return client;
}
