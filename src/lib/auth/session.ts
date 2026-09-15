import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import {
  SYSTEM_ROLES,
  SYSTEM_ROLE_KEYS,
  resolvePermissions,
  type Permission,
} from "@/lib/permissions";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

type SessionUser = { id: string; name: string; email: string };

// "platform": administrador de CellFix, entra a /admin sin taller.
// "tenant": usuario de un taller, entra a /dashboard con los permisos de sus roles.
export type Session =
  | { kind: "platform"; user: SessionUser }
  | {
      kind: "tenant";
      user: SessionUser;
      tenant: { id: string; name: string; slug: string };
      isOwner: boolean;
      roleNames: string[];
      permissions: Permission[];
    };

type SessionRow = {
  user_id: string;
  user_name: string;
  email: string;
  is_platform_admin: boolean;
  session_tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  is_member: boolean;
  system_roles: string[] | null;
  custom_role_names: string[] | null;
  custom_permissions: string[] | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, tenantId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.query("DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()", [userId]);
  await db.query("INSERT INTO sessions (id, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, $4)", [
    hashToken(token),
    userId,
    tenantId,
    expiresAt,
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// Validación real contra la base de datos, memoizada por render.
// Los permisos se calculan en cada petición: un cambio de roles aplica de inmediato.
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await db.query<SessionRow>(
    `SELECT u.id AS user_id, u.name AS user_name, u.email, u.is_platform_admin,
            s.tenant_id AS session_tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
            m.user_id IS NOT NULL AS is_member,
            r.system_roles, r.custom_role_names, r.custom_permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN memberships m ON m.tenant_id = s.tenant_id AND m.user_id = s.user_id
       LEFT JOIN tenants t ON t.id = m.tenant_id AND t.status = 'active'
       LEFT JOIN LATERAL (
         SELECT array_agg(DISTINCT mr.system_role) FILTER (WHERE mr.system_role IS NOT NULL) AS system_roles,
                array_agg(DISTINCT cr.name) FILTER (WHERE cr.id IS NOT NULL) AS custom_role_names,
                array_agg(DISTINCT p.permission) FILTER (WHERE p.permission IS NOT NULL) AS custom_permissions
           FROM member_roles mr
           LEFT JOIN custom_roles cr ON cr.id = mr.custom_role_id
           LEFT JOIN custom_role_permissions p ON p.role_id = cr.id
          WHERE mr.tenant_id = s.tenant_id AND mr.user_id = s.user_id
       ) r ON true
      WHERE s.id = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );

  const row = rows[0];
  if (!row) return null;

  const user = { id: row.user_id, name: row.user_name, email: row.email };

  if (row.session_tenant_id) {
    // Sesión de taller: deja de valer si el taller está suspendido o el usuario ya no es miembro.
    if (!row.is_member || !row.tenant_name || !row.tenant_slug) return null;

    const systemRoles = SYSTEM_ROLE_KEYS.filter((role) => row.system_roles?.includes(role));
    return {
      kind: "tenant",
      user,
      tenant: { id: row.session_tenant_id, name: row.tenant_name, slug: row.tenant_slug },
      isOwner: systemRoles.includes("owner"),
      roleNames: [
        ...systemRoles.map((role) => SYSTEM_ROLES[role].label),
        ...(row.custom_role_names ?? []).sort((a, b) => a.localeCompare(b, "es")),
      ],
      permissions: resolvePermissions(systemRoles, row.custom_permissions ?? []),
    };
  }

  // Sesión sin taller: solo vale mientras el usuario siga siendo administrador.
  return row.is_platform_admin ? { kind: "platform", user } : null;
});

export function getHomePath(session: Session) {
  return session.kind === "platform" ? "/admin" : "/dashboard";
}

// Para páginas y acciones de un taller. session.tenant.id es el tenant con el que
// se deben filtrar las consultas.
export async function requireTenantSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.kind !== "tenant") redirect(getHomePath(session));
  return session;
}

// Igual que requireTenantSession, pero exige un permiso concreto.
export async function requireTenantPermission(permission: Permission) {
  const session = await requireTenantSession();
  if (!session.permissions.includes(permission)) redirect("/dashboard");
  return session;
}

// Exige al menos uno de los permisos.
export async function requireAnyTenantPermission(permissions: Permission[]) {
  const session = await requireTenantSession();
  if (!permissions.some((permission) => session.permissions.includes(permission))) redirect("/dashboard");
  return session;
}

// Para páginas y acciones del panel administrativo.
export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.kind !== "platform") redirect(getHomePath(session));
  return session;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.query("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}
