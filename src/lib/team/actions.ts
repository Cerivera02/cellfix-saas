"use server";

import { requireTenantPermission } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import type { Permission } from "@/lib/permissions";
import {
  addMemberFromForm,
  createCustomRoleFromForm,
  deleteCustomRoleFromForm,
  removeMemberFromForm,
  setMemberPasswordFromForm,
  updateCustomRoleFromForm,
  updateMemberRolesFromForm,
} from "@/lib/team/operations";
import { actorFromSession } from "@/lib/team/view";

// Acciones del dashboard del taller. El taller siempre sale de la sesión, nunca del cliente.

async function authorize(permission: Permission) {
  const session = await requireTenantPermission(permission);
  return { tenantId: session.tenant.id, actor: actorFromSession(session) };
}

export async function addTeamMemberAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize("users.manage");
  return addMemberFromForm(actor, tenantId, formData);
}

export async function updateTeamMemberRolesAction(
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenantId, actor } = await authorize("users.manage");
  return updateMemberRolesFromForm(actor, tenantId, userId, formData);
}

export async function removeTeamMemberAction(userId: string): Promise<FormState> {
  const { tenantId, actor } = await authorize("users.manage");
  return removeMemberFromForm(actor, tenantId, userId);
}

export async function setTeamMemberPasswordAction(
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenantId, actor } = await authorize("users.manage");
  return setMemberPasswordFromForm(actor, tenantId, userId, formData);
}

export async function createTeamRoleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize("roles.manage");
  return createCustomRoleFromForm(actor, tenantId, formData);
}

export async function updateTeamRoleAction(
  roleId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenantId, actor } = await authorize("roles.manage");
  return updateCustomRoleFromForm(actor, tenantId, roleId, formData);
}

export async function deleteTeamRoleAction(roleId: string): Promise<FormState> {
  const { tenantId, actor } = await authorize("roles.manage");
  return deleteCustomRoleFromForm(actor, tenantId, roleId);
}
