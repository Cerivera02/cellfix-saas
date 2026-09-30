import "server-only";
import type { PoolClient } from "pg";
import { isUniqueViolation } from "@/lib/db";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Catálogo de garantías del taller. Se elige una al entregar un equipo reparado.
// No verifica la sesión: la acción o página que llama ya comprobó los permisos.

export type WarrantyInput = { name: string; days: number };
export type Warranty = WarrantyInput & { id: string; isActive: boolean };

export const WARRANTY_NAME_MAX = 60;
export const WARRANTY_DAYS_MAX = 3650;

// Error con un mensaje apto para mostrarse en la interfaz.
export class WarrantyError extends Error {}

type WarrantyRow = { id: string; name: string; days: number; is_active: boolean };

function mapWarranty(row: WarrantyRow): Warranty {
  return { id: row.id, name: row.name, days: row.days, isActive: row.is_active };
}

// Las activas primero y de menos a más días.
export async function listWarranties(tenantId: string, options: { activeOnly: boolean }): Promise<Warranty[]> {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<WarrantyRow>(
      `SELECT id, name, days, is_active
         FROM warranties
        WHERE is_active OR NOT $1
        ORDER BY is_active DESC, days, lower(name)`,
      [options.activeOnly],
    );
    return rows.map(mapWarranty);
  });
}

// Garantía activa del catálogo dentro de una transacción ya abierta; null si no existe o se archivó.
export async function findActiveWarranty(client: PoolClient, warrantyId: string): Promise<WarrantyInput | null> {
  if (!UUID_PATTERN.test(warrantyId)) return null;
  const { rows } = await client.query<WarrantyRow>(
    "SELECT id, name, days, is_active FROM warranties WHERE id = $1 AND is_active",
    [warrantyId],
  );
  return rows[0] ? { name: rows[0].name, days: rows[0].days } : null;
}

export async function hasActiveWarranties(client: PoolClient) {
  const { rowCount } = await client.query("SELECT 1 FROM warranties WHERE is_active LIMIT 1");
  return Boolean(rowCount);
}

function translateError(error: unknown): never {
  if (isUniqueViolation(error, "warranties_name_key")) throw new WarrantyError("Ya existe una garantía con este nombre.");
  throw error;
}

function assertId(warrantyId: string) {
  if (!UUID_PATTERN.test(warrantyId)) throw new WarrantyError("Solicitud no válida.");
}

export async function createWarranty(tenantId: string, input: WarrantyInput) {
  try {
    await withTenantDb(tenantId, (client) =>
      client.query("INSERT INTO warranties (name, days) VALUES ($1, $2)", [input.name, input.days]),
    );
  } catch (error) {
    translateError(error);
  }
}

// Las órdenes ya entregadas guardan su copia: editar el catálogo no las cambia.
export async function updateWarranty(tenantId: string, warrantyId: string, input: WarrantyInput) {
  assertId(warrantyId);
  try {
    await withTenantDb(tenantId, async (client) => {
      const { rowCount } = await client.query("UPDATE warranties SET name = $1, days = $2 WHERE id = $3", [
        input.name,
        input.days,
        warrantyId,
      ]);
      if (!rowCount) throw new WarrantyError("La garantía ya no existe.");
    });
  } catch (error) {
    translateError(error);
  }
}

export async function setWarrantyActive(tenantId: string, warrantyId: string, active: boolean) {
  assertId(warrantyId);
  await withTenantDb(tenantId, (client) =>
    client.query("UPDATE warranties SET is_active = $1 WHERE id = $2", [active, warrantyId]),
  );
}
