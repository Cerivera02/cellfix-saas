import "server-only";
import { refresh } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { isSystemRole, normalizePermissions } from "@/lib/permissions";
import {
  EmailTakenError,
  RoleNameTakenError,
  TeamError,
  addMember,
  createCustomRole,
  deleteCustomRole,
  removeMember,
  setMemberPassword,
  updateCustomRole,
  updateMemberRoles,
  type RoleSelection,
  type TeamActor,
} from "@/lib/team/core";
import { EMAIL_PATTERN, UUID_PATTERN, getPasswordError, readField, readPassword } from "@/lib/validation";

// Traduce formularios a operaciones del equipo. Lo usan las acciones del panel
// administrativo y las del dashboard del taller, cada una con su propio actor.

type Context = { fields?: Record<string, string>; selections?: Record<string, string[]> };

function readStrings(formData: FormData, key: string) {
  return [...new Set(formData.getAll(key).filter((value): value is string => typeof value === "string"))];
}

function readRoles(formData: FormData): RoleSelection {
  return {
    systemRoles: readStrings(formData, "systemRoles").filter(isSystemRole),
    customRoleIds: readStrings(formData, "customRoles")
      .map((id) => id.toLowerCase())
      .filter((id) => UUID_PATTERN.test(id)),
  };
}

function toSelections(roles: RoleSelection) {
  return { systemRoles: roles.systemRoles, customRoles: roles.customRoleIds };
}

function hasRoles(roles: RoleSelection) {
  return roles.systemRoles.length > 0 || roles.customRoleIds.length > 0;
}

function toErrorState(error: unknown, context: Context = {}): FormState {
  if (error instanceof EmailTakenError) return { ...context, errors: { email: error.message } };
  if (error instanceof RoleNameTakenError) return { ...context, errors: { name: error.message } };
  if (error instanceof TeamError) return { ...context, message: error.message };
  console.error("Error al gestionar el equipo:", error);
  return { ...context, message: "No pudimos guardar los cambios. Inténtalo de nuevo." };
}

export async function addMemberFromForm(actor: TeamActor, tenantId: string, formData: FormData): Promise<FormState> {
  const fields = {
    name: readField(formData, "name", 100),
    email: readField(formData, "email", 200).toLowerCase(),
  };
  const password = readPassword(formData);
  const roles = readRoles(formData);
  const context = { fields, selections: toSelections(roles) };

  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Escribe el nombre.";
  if (!EMAIL_PATTERN.test(fields.email)) errors.email = "Escribe un correo válido.";
  const passwordError = getPasswordError(password);
  if (passwordError) errors.password = passwordError;
  if (!hasRoles(roles)) errors.roles = "Asigna al menos un rol.";
  if (Object.keys(errors).length > 0) return { ...context, errors };

  try {
    await addMember(actor, tenantId, { ...fields, password, ...roles });
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Usuario agregado." };
}

export async function updateMemberRolesFromForm(
  actor: TeamActor,
  tenantId: string,
  userId: string,
  formData: FormData,
): Promise<FormState> {
  const roles = readRoles(formData);
  const context = { selections: toSelections(roles) };
  if (!hasRoles(roles)) return { ...context, errors: { roles: "Asigna al menos un rol." } };

  try {
    await updateMemberRoles(actor, tenantId, userId, roles);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Roles actualizados." };
}

export async function removeMemberFromForm(actor: TeamActor, tenantId: string, userId: string): Promise<FormState> {
  try {
    await removeMember(actor, tenantId, userId);
  } catch (error) {
    return toErrorState(error);
  }

  refresh();
  return { success: "Usuario quitado." };
}

export async function setMemberPasswordFromForm(
  actor: TeamActor,
  tenantId: string,
  userId: string,
  formData: FormData,
): Promise<FormState> {
  const password = readPassword(formData);
  const passwordError = getPasswordError(password);
  if (passwordError) return { errors: { password: passwordError } };

  try {
    await setMemberPassword(actor, tenantId, userId, password);
  } catch (error) {
    return toErrorState(error);
  }

  return { success: "Contraseña actualizada; se cerraron sus sesiones." };
}

function readCustomRole(formData: FormData) {
  const fields = {
    name: readField(formData, "name", 60),
    description: readField(formData, "description", 200),
  };
  const permissions = normalizePermissions(readStrings(formData, "permissions"));
  const context = { fields, selections: { permissions } };

  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Escribe el nombre del rol.";
  if (permissions.length === 0) errors.permissions = "Elige al menos un permiso.";

  return { input: { ...fields, permissions }, context, errors };
}

export async function createCustomRoleFromForm(actor: TeamActor, tenantId: string, formData: FormData): Promise<FormState> {
  const { input, context, errors } = readCustomRole(formData);
  if (Object.keys(errors).length > 0) return { ...context, errors };

  try {
    await createCustomRole(actor, tenantId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Rol creado." };
}

export async function updateCustomRoleFromForm(
  actor: TeamActor,
  tenantId: string,
  roleId: string,
  formData: FormData,
): Promise<FormState> {
  const { input, context, errors } = readCustomRole(formData);
  if (Object.keys(errors).length > 0) return { ...context, errors };

  try {
    await updateCustomRole(actor, tenantId, roleId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Rol actualizado." };
}

export async function deleteCustomRoleFromForm(actor: TeamActor, tenantId: string, roleId: string): Promise<FormState> {
  try {
    await deleteCustomRole(actor, tenantId, roleId);
  } catch (error) {
    return toErrorState(error);
  }

  refresh();
  return { success: "Rol borrado." };
}
