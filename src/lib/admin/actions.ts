"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/session";
import {
  createTenant,
  setTenantModules,
  setTenantStatus,
  updateTenantName,
  type TenantStatus,
} from "@/lib/admin/tenants";
import type { FormState } from "@/lib/form-state";
import { MODULES, MODULE_KEYS, isModuleKey } from "@/lib/modules";
import { EmailTakenError, PLATFORM_ACTOR } from "@/lib/team/core";
import {
  addMemberFromForm,
  createCustomRoleFromForm,
  deleteCustomRoleFromForm,
  removeMemberFromForm,
  setMemberPasswordFromForm,
  updateCustomRoleFromForm,
  updateMemberRolesFromForm,
} from "@/lib/team/operations";
import { EMAIL_PATTERN, getPasswordError, readField, readPassword } from "@/lib/validation";

// Cada acción verifica al administrador antes de cualquier try/catch,
// para que la redirección a /login no quede atrapada como un error.

export async function createTenantAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();

  const fields = {
    name: readField(formData, "name", 150),
    ownerName: readField(formData, "ownerName", 100),
    ownerEmail: readField(formData, "ownerEmail", 200).toLowerCase(),
  };
  const password = readPassword(formData, "ownerPassword");

  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Escribe el nombre del taller.";
  if (!fields.ownerName) errors.ownerName = "Escribe el nombre del propietario.";
  if (!EMAIL_PATTERN.test(fields.ownerEmail)) errors.ownerEmail = "Escribe un correo válido.";
  const passwordError = getPasswordError(password);
  if (passwordError) errors.ownerPassword = passwordError;

  if (Object.keys(errors).length > 0) {
    return { errors, fields };
  }

  let tenantId: string;
  try {
    tenantId = await createTenant(fields.name, { name: fields.ownerName, email: fields.ownerEmail, password });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { errors: { ownerEmail: error.message }, fields };
    }
    console.error("Error al crear el taller:", error);
    return { message: "No pudimos crear el taller. Inténtalo de nuevo.", fields };
  }

  redirect(`/admin/tenants/${tenantId}`);
}

export async function updateTenantNameAction(
  tenantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();

  const name = readField(formData, "name", 150);
  if (!name) {
    return { errors: { name: "Escribe el nombre del taller." }, fields: { name } };
  }

  try {
    await updateTenantName(tenantId, name);
  } catch (error) {
    console.error("Error al actualizar el taller:", error);
    return { message: "No pudimos guardar los cambios.", fields: { name } };
  }

  refresh();
  return { success: "Nombre actualizado." };
}

export async function setTenantStatusAction(tenantId: string, status: TenantStatus) {
  await requirePlatformAdmin();
  if (status !== "active" && status !== "suspended") return;

  await setTenantStatus(tenantId, status);
  refresh();
}

export async function setTenantModulesAction(
  tenantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();

  const selected = formData.getAll("modules").filter((value): value is string => typeof value === "string" && isModuleKey(value));
  const selections = { modules: selected };

  // Un módulo con requisitos (Compras necesita Inventario) no se activa solo.
  const missing = MODULE_KEYS.find(
    (key) => selected.includes(key) && MODULES[key].requires.some((required) => !selected.includes(required)),
  );
  if (missing) {
    const required = MODULES[missing].requires.map((key) => MODULES[key].label).join(" y ");
    return { selections, message: `${MODULES[missing].label} requiere ${required}.` };
  }

  try {
    await setTenantModules(tenantId, selected);
  } catch (error) {
    console.error("Error al actualizar los módulos del taller:", error);
    return { selections, message: "No pudimos guardar los módulos." };
  }

  refresh();
  return { success: "Módulos actualizados." };
}

export async function addMemberAction(tenantId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  return addMemberFromForm(PLATFORM_ACTOR, tenantId, formData);
}

export async function updateMemberRolesAction(
  tenantId: string,
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return updateMemberRolesFromForm(PLATFORM_ACTOR, tenantId, userId, formData);
}

export async function removeMemberAction(tenantId: string, userId: string): Promise<FormState> {
  await requirePlatformAdmin();
  return removeMemberFromForm(PLATFORM_ACTOR, tenantId, userId);
}

export async function setMemberPasswordAction(
  tenantId: string,
  userId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return setMemberPasswordFromForm(PLATFORM_ACTOR, tenantId, userId, formData);
}

export async function createCustomRoleAction(
  tenantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return createCustomRoleFromForm(PLATFORM_ACTOR, tenantId, formData);
}

export async function updateCustomRoleAction(
  tenantId: string,
  roleId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePlatformAdmin();
  return updateCustomRoleFromForm(PLATFORM_ACTOR, tenantId, roleId, formData);
}

export async function deleteCustomRoleAction(tenantId: string, roleId: string): Promise<FormState> {
  await requirePlatformAdmin();
  return deleteCustomRoleFromForm(PLATFORM_ACTOR, tenantId, roleId);
}
