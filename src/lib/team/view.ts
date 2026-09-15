import type { Session } from "@/lib/auth/session";
import { ALL_PERMISSIONS, SYSTEM_ROLES, SYSTEM_ROLE_KEYS, type Permission } from "@/lib/permissions";
import type { Team, TeamActor, TeamMember } from "@/lib/team/core";

// Datos derivados para pintar la gestión del equipo según quién la ve.

export type RoleOption = { value: string; label: string; description: string; disabled: boolean };

export type RoleOptions = { system: RoleOption[]; custom: RoleOption[] };

export function actorFromSession(session: Extract<Session, { kind: "tenant" }>): TeamActor {
  return { kind: "member", userId: session.user.id, isOwner: session.isOwner, permissions: session.permissions };
}

// null = sin restricciones (administrador de la plataforma o propietario).
function getOwnPermissions(actor: TeamActor): Set<Permission> | null {
  return actor.kind === "platform" || actor.isOwner ? null : new Set(actor.permissions);
}

export function getRoleOptions(team: Team, actor: TeamActor): RoleOptions {
  const own = getOwnPermissions(actor);
  const canGrant = (permissions: readonly Permission[]) => !own || permissions.every((p) => own.has(p));

  return {
    system: SYSTEM_ROLE_KEYS.map((key) => ({
      value: key,
      label: SYSTEM_ROLES[key].label,
      description: SYSTEM_ROLES[key].description,
      disabled: key === "owner" ? own !== null : !canGrant(SYSTEM_ROLES[key].permissions),
    })),
    custom: team.customRoles.map((role) => ({
      value: role.id,
      label: role.name,
      description:
        role.description || (role.permissions.length === 1 ? "1 permiso" : `${role.permissions.length} permisos`),
      disabled: !canGrant(role.permissions),
    })),
  };
}

// Permisos que el actor no puede otorgar al crear o editar roles Custom.
export function getDisabledPermissions(actor: TeamActor): Permission[] {
  const own = getOwnPermissions(actor);
  return own ? ALL_PERMISSIONS.filter((permission) => !own.has(permission)) : [];
}

export function getMemberFlags(team: Team, actor: TeamActor, member: TeamMember) {
  const unrestricted = getOwnPermissions(actor) === null;
  const isOwner = member.systemRoles.includes("owner");
  const isSelf = actor.kind === "member" && actor.userId === member.id;
  const canTouch = unrestricted || !isOwner;

  return {
    canEditRoles: canTouch && (!isSelf || unrestricted),
    canChangePassword: canTouch && !isSelf,
    canRemove: canTouch && !isSelf && !(isOwner && team.ownerCount <= 1),
  };
}
