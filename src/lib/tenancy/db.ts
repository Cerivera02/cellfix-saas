import "server-only";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";

// Cada taller guarda sus datos de negocio en su propio schema (t_<id sin guiones>),
// el mismo nombre que calcula la columna generada tenants.schema_name.

const SCHEMA_PATTERN = /^t_[0-9a-f]{32}$/;

export function tenantSchemaName(tenantId: string) {
  return `t_${tenantId.replace(/-/g, "").toLowerCase()}`;
}

// Ejecuta `callback` en una transacción con el search_path apuntando SOLO al schema del
// taller: una consulta sin prefijo nunca puede leer ni escribir datos de otro taller.
// El tenantId debe venir de la sesión, nunca del cliente.
export async function withTenantDb<T>(tenantId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const schema = tenantSchemaName(tenantId);
  if (!SCHEMA_PATTERN.test(schema)) throw new Error("Taller no válido.");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL se revierte al terminar la transacción, así la conexión vuelve limpia al pool.
    await client.query(`SET LOCAL search_path TO ${client.escapeIdentifier(schema)}`);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
