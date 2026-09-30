import "server-only";
import { db } from "@/lib/db";
import { normalizeModules, type ModuleKey } from "@/lib/modules";

// Módulos de un taller activo, para rutas públicas que no tienen sesión (evidencia, seguimiento).
// null si el taller no existe o está suspendido.
export async function getActiveTenantModules(tenantId: string): Promise<ModuleKey[] | null> {
  const { rows } = await db.query<{ modules: string[] }>(
    "SELECT modules FROM tenants WHERE id::text = $1 AND status = 'active'",
    [tenantId],
  );
  return rows[0] ? normalizeModules(rows[0].modules) : null;
}
