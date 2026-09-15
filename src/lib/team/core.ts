import "server-only";
import type { PoolClient } from "pg";
import { db, isUniqueViolation, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  SYSTEM_ROLES,
  SYSTEM_ROLE_KEYS,
  normalizePermissions,
  type Permission,
  type SystemRole,
} from "@/lib/permissions";
import { UUID_PATTERN } from "@/lib/validation";

// Operaciones sobre el equipo de un taller: usuarios, sus roles y los roles Custom.
// No verifican la sesión: la acción que las llama autentica y construye el actor.
// Aquí sí se aplican las reglas de negocio (último propietario, no escalar permisos).

export type TeamActor =
  | { kind: "platform" }
  | { kind: "member"; userId: string; isOwner: boolean; permissions: readonly Permission[] };

export const PLATFORM_ACTOR: TeamActor = { kind: "platform" };

export type CustomRole = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  memberCount: number;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  systemRoles: SystemRole[];
  customRoleIds: string[];
};

export type Team = { members: TeamMember[]; customRoles: CustomRole[]; ownerCount: number };

export type RoleSelection = { systemRoles: SystemRole[]; customRoleIds: string[] };

export type NewMember = RoleSelection & { name: string; email: string; password: string };

export type CustomRoleInput = { name: string; description: string; permissions: Permission[] };

// Error con un mensaje apto para mostrarse en la interfaz.
export class TeamError extends Error {}

export class EmailTakenError extends TeamError {
  constructor() {
    super("Ya existe un usuario con este correo.");
  }
}

export class RoleNameTakenError extends TeamError {
  constructor() {
    super("Ya existe un rol con este nombre.");
  }
}

function assertIds(...ids: string[]) {
  if (ids.some((id) => !UUID_PATTERN.test(id))) throw new TeamError("Solicitud no válida.");
}

function isUnrestricted(actor: TeamActor) {
  return actor.kind === "platform" || actor.isOwner;
}

function isSelf(actor: TeamActor, userId: string) {
  return actor.kind === "member" && actor.userId === userId;
}

// Un miembro con permisos delegados solo puede otorgar permisos que él mismo tiene.
function assertCanGrant(actor: TeamActor, permissions: readonly string[]) {
  if (isUnrestricted(actor)) return;
  const own = new Set<string>(actor.kind === "member" ? actor.permissions : []);
  if (permissions.some((permission) => !own.has(permission))) {
    throw new TeamError("No puedes otorgar permisos que tú no tienes.");
  }
}

export async function getTeam(tenantId: string): Promise<Team> {
  assertIds(tenantId);

  const [{ rows: memberRows }, { rows: roleRows }] = await Promise.all([
    db.query<{ id: string; name: string; email: string; system_roles: string[]; custom_role_ids: string[] }>(
      `SELECT u.id, u.name, u.email,
              COALESCE(array_agg(mr.system_role) FILTER (WHERE mr.system_role IS NOT NULL), '{}') AS system_roles,
              COALESCE(array_agg(mr.custom_role_id::text) FILTER (WHERE mr.custom_role_id IS NOT NULL), '{}') AS custom_role_ids
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN member_roles mr ON mr.tenant_id = m.tenant_id AND mr.user_id = m.user_id
        WHERE m.tenant_id = $1
        GROUP BY u.id, m.created_at
        ORDER BY COALESCE(bool_or(mr.system_role = 'owner'), false) DESC, m.created_at`,
      [tenantId],
    ),
    db.query<{ id: string; name: string; description: string; permissions: string[]; member_count: number }>(
      `SELECT cr.id, cr.name, cr.description,
              COALESCE((SELECT array_agg(p.permission) FROM custom_role_permissions p WHERE p.role_id = cr.id), '{}') AS permissions,
              (SELECT count(*)::int FROM member_roles mr WHERE mr.custom_role_id = cr.id) AS member_count
         FROM custom_roles cr
        WHERE cr.tenant_id = $1
        ORDER BY lower(cr.name)`,
      [tenantId],
    ),
  ]);

  const members = memberRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    systemRoles: SYSTEM_ROLE_KEYS.filter((role) => row.system_roles.includes(role)),
    customRoleIds: row.custom_role_ids,
  }));

  return {
    members,
    customRoles: roleRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: normalizePermissions(row.permissions),
      memberCount: row.member_count,
    })),
    ownerCount: members.filter((member) => member.systemRoles.includes("owner")).length,
  };
}

async function lockTenant(client: PoolClient, tenantId: string) {
  // Serializa los cambios del equipo para que las reglas (p. ej. último propietario) no se crucen.
  const { rowCount } = await client.query("SELECT 1 FROM tenants WHERE id = $1 FOR UPDATE", [tenantId]);
  if (!rowCount) throw new TeamError("El taller ya no existe.");
}

type MemberState = RoleSelection & { isOwner: boolean; ownerCount: number };

async function getMemberState(client: PoolClient, tenantId: string, userId: string): Promise<MemberState | null> {
  const { rows } = await client.query<{ system_roles: string[]; custom_role_ids: string[]; owner_count: number }>(
    `SELECT COALESCE(array_agg(mr.system_role) FILTER (WHERE mr.system_role IS NOT NULL), '{}') AS system_roles,
            COALESCE(array_agg(mr.custom_role_id::text) FILTER (WHERE mr.custom_role_id IS NOT NULL), '{}') AS custom_role_ids,
            (SELECT count(*)::int FROM member_roles WHERE tenant_id = $1 AND system_role = 'owner') AS owner_count
       FROM memberships m
       LEFT JOIN member_roles mr ON mr.tenant_id = m.tenant_id AND mr.user_id = m.user_id
      WHERE m.tenant_id = $1 AND m.user_id = $2
      GROUP BY m.user_id`,
    [tenantId, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const systemRoles = SYSTEM_ROLE_KEYS.filter((role) => row.system_roles.includes(role));
  return {
    systemRoles,
    customRoleIds: row.custom_role_ids,
    isOwner: systemRoles.includes("owner"),
    ownerCount: row.owner_count,
  };
}

function assertCanManageTarget(actor: TeamActor, target: MemberState) {
  if (!isUnrestricted(actor) && target.isOwner) {
    throw new TeamError("Solo un propietario puede modificar a otro propietario.");
  }
}

// Valida que los roles existan en el taller y que el actor pueda otorgar los que agrega.
async function validateAssignment(
  client: PoolClient,
  actor: TeamActor,
  tenantId: string,
  next: RoleSelection,
  current: RoleSelection = { systemRoles: [], customRoleIds: [] },
) {
  if (next.systemRoles.length === 0 && next.customRoleIds.length === 0) {
    throw new TeamError("Asigna al menos un rol.");
  }

  const customPermissions = new Map<string, string[]>();
  if (next.customRoleIds.length > 0) {
    const { rows } = await client.query<{ id: string; permissions: string[] }>(
      `SELECT cr.id::text AS id,
              COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
         FROM custom_roles cr
         LEFT JOIN custom_role_permissions p ON p.role_id = cr.id
        WHERE cr.tenant_id = $1 AND cr.id = ANY($2::uuid[])
        GROUP BY cr.id`,
      [tenantId, next.customRoleIds],
    );
    if (rows.length !== next.customRoleIds.length) throw new TeamError("Uno de los roles elegidos ya no existe.");
    for (const row of rows) customPermissions.set(row.id, row.permissions);
  }

  if (isUnrestricted(actor)) return;

  // Solo se revisan los roles nuevos: conservar los que ya tenía no otorga nada.
  const addedSystem = next.systemRoles.filter((role) => !current.systemRoles.includes(role));
  if (addedSystem.includes("owner")) throw new TeamError("Solo un propietario puede asignar el rol Propietario.");
  const addedCustom = next.customRoleIds.filter((id) => !current.customRoleIds.includes(id));

  assertCanGrant(actor, [
    ...addedSystem.flatMap((role) => SYSTEM_ROLES[role].permissions),
    ...addedCustom.flatMap((id) => customPermissions.get(id) ?? []),
  ]);
}

async function insertRoles(client: PoolClient, tenantId: string, userId: string, roles: RoleSelection) {
  if (roles.systemRoles.length > 0) {
    await client.query(
      "INSERT INTO member_roles (tenant_id, user_id, system_role) SELECT $1::uuid, $2::uuid, unnest($3::text[])",
      [tenantId, userId, roles.systemRoles],
    );
  }
  if (roles.customRoleIds.length > 0) {
    await client.query(
      "INSERT INTO member_roles (tenant_id, user_id, custom_role_id) SELECT $1::uuid, $2::uuid, unnest($3::uuid[])",
      [tenantId, userId, roles.customRoleIds],
    );
  }
}

export async function addMember(actor: TeamActor, tenantId: string, member: NewMember) {
  assertIds(tenantId, ...member.customRoleIds);
  const passwordHash = await hashPassword(member.password);

  try {
    await withTransaction(async (client) => {
      await lockTenant(client, tenantId);
      await validateAssignment(client, actor, tenantId, member);

      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [member.name, member.email, passwordHash],
      );
      const userId = rows[0].id;
      await client.query("INSERT INTO memberships (tenant_id, user_id) VALUES ($1, $2)", [tenantId, userId]);
      await insertRoles(client, tenantId, userId, member);
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_key")) throw new EmailTakenError();
    throw error;
  }
}

export async function updateMemberRoles(actor: TeamActor, tenantId: string, userId: string, roles: RoleSelection) {
  assertIds(tenantId, userId, ...roles.customRoleIds);

  await withTransaction(async (client) => {
    await lockTenant(client, tenantId);
    const target = await getMemberState(client, tenantId, userId);
    if (!target) throw new TeamError("El usuario ya no pertenece a este taller.");

    if (isSelf(actor, userId) && !isUnrestricted(actor)) {
      throw new TeamError("No puedes cambiar tus propios roles.");
    }
    assertCanManageTarget(actor, target);
    await validateAssignment(client, actor, tenantId, roles, target);

    if (target.isOwner && !roles.systemRoles.includes("owner") && target.ownerCount <= 1) {
      throw new TeamError("El taller debe conservar al menos un propietario.");
    }

    await client.query("DELETE FROM member_roles WHERE tenant_id = $1 AND user_id = $2", [tenantId, userId]);
    await insertRoles(client, tenantId, userId, roles);
  });
}

export async function removeMember(actor: TeamActor, tenantId: string, userId: string) {
  assertIds(tenantId, userId);

  await withTransaction(async (client) => {
    await lockTenant(client, tenantId);
    const target = await getMemberState(client, tenantId, userId);
    if (!target) return;

    if (isSelf(actor, userId)) throw new TeamError("No puedes quitarte a ti mismo del taller.");
    assertCanManageTarget(actor, target);
    if (target.isOwner && target.ownerCount <= 1) {
      throw new TeamError("El taller debe conservar al menos un propietario.");
    }

    // Sus roles y sesiones en este taller se borran en cascada con la membresía.
    await client.query("DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2", [tenantId, userId]);

    // Si ya no pertenece a ningún taller, se elimina la cuenta para liberar el correo.
    await client.query(
      `DELETE FROM users
        WHERE id = $1 AND NOT is_platform_admin
          AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = $1)`,
      [userId],
    );
  });
}

export async function setMemberPassword(actor: TeamActor, tenantId: string, userId: string, password: string) {
  assertIds(tenantId, userId);
  if (isSelf(actor, userId)) throw new TeamError("No puedes cambiar tu propia contraseña desde aquí.");
  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    const target = await getMemberState(client, tenantId, userId);
    if (!target) throw new TeamError("El usuario ya no pertenece a este taller.");
    assertCanManageTarget(actor, target);

    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
    // Cierra sus sesiones para que la contraseña anterior deje de servir.
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  });
}

async function insertPermissions(client: PoolClient, roleId: string, permissions: readonly Permission[]) {
  await client.query(
    "INSERT INTO custom_role_permissions (role_id, permission) SELECT $1::uuid, unnest($2::text[])",
    [roleId, permissions],
  );
}

export async function createCustomRole(actor: TeamActor, tenantId: string, input: CustomRoleInput) {
  assertIds(tenantId);
  if (input.permissions.length === 0) throw new TeamError("Elige al menos un permiso.");
  assertCanGrant(actor, input.permissions);

  try {
    await withTransaction(async (client) => {
      await lockTenant(client, tenantId);
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO custom_roles (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id",
        [tenantId, input.name, input.description],
      );
      await insertPermissions(client, rows[0].id, input.permissions);
    });
  } catch (error) {
    if (isUniqueViolation(error, "custom_roles_tenant_name_key")) throw new RoleNameTakenError();
    throw error;
  }
}

export async function updateCustomRole(actor: TeamActor, tenantId: string, roleId: string, input: CustomRoleInput) {
  assertIds(tenantId, roleId);
  if (input.permissions.length === 0) throw new TeamError("Elige al menos un permiso.");

  try {
    await withTransaction(async (client) => {
      await lockTenant(client, tenantId);
      const { rows } = await client.query<{ permission: string | null }>(
        `SELECT p.permission
           FROM custom_roles cr
           LEFT JOIN custom_role_permissions p ON p.role_id = cr.id
          WHERE cr.id = $1 AND cr.tenant_id = $2`,
        [roleId, tenantId],
      );
      if (rows.length === 0) throw new TeamError("El rol ya no existe.");

      const current = rows.map((row) => row.permission).filter((permission) => permission !== null);
      assertCanGrant(actor, input.permissions.filter((permission) => !current.includes(permission)));

      await client.query("UPDATE custom_roles SET name = $1, description = $2 WHERE id = $3", [
        input.name,
        input.description,
        roleId,
      ]);
      await client.query("DELETE FROM custom_role_permissions WHERE role_id = $1", [roleId]);
      await insertPermissions(client, roleId, input.permissions);
    });
  } catch (error) {
    if (isUniqueViolation(error, "custom_roles_tenant_name_key")) throw new RoleNameTakenError();
    throw error;
  }
}

export async function deleteCustomRole(actor: TeamActor, tenantId: string, roleId: string) {
  assertIds(tenantId, roleId);

  await withTransaction(async (client) => {
    await lockTenant(client, tenantId);
    const { rows } = await client.query<{ member_count: number }>(
      `SELECT (SELECT count(*)::int FROM member_roles WHERE custom_role_id = cr.id) AS member_count
         FROM custom_roles cr
        WHERE cr.id = $1 AND cr.tenant_id = $2`,
      [roleId, tenantId],
    );
    const role = rows[0];
    if (!role) return;

    if (role.member_count > 0) {
      throw new TeamError(
        role.member_count === 1
          ? "Este rol está asignado a 1 usuario; quítaselo antes de borrarlo."
          : `Este rol está asignado a ${role.member_count} usuarios; quítaselo antes de borrarlo.`,
      );
    }

    await client.query("DELETE FROM custom_roles WHERE id = $1", [roleId]);
  });
}
