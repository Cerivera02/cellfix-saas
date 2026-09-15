"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantPermission } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import {
  BarcodeTakenError,
  InventoryError,
  NameTakenError,
  createCategory,
  createItem,
  createSupplier,
  deleteCategory,
  recordMovement,
  renameCategory,
  setItemActive,
  setSupplierActive,
  updateItem,
  updateSupplier,
} from "@/lib/inventory/core";
import { parseCategoryForm, parseItemForm, parseMovementForm, parseSupplierForm } from "@/lib/inventory/form";

// Acciones del inventario. El taller sale siempre de la sesión y todas exigen
// el permiso "Gestionar inventario".

async function authorize() {
  const session = await requireTenantPermission("inventory.manage");
  return { tenantId: session.tenant.id, actor: { userId: session.user.id, userName: session.user.name } };
}

type Context = { fields?: Record<string, string>; selections?: Record<string, string[]> };

function toErrorState(error: unknown, context: Context = {}): FormState {
  if (error instanceof BarcodeTakenError) return { ...context, errors: { barcode: error.message } };
  if (error instanceof NameTakenError) return { ...context, errors: { name: error.message } };
  if (error instanceof InventoryError) return { ...context, message: error.message };
  console.error("Error en el inventario:", error);
  return { ...context, message: "No pudimos guardar los cambios. Inténtalo de nuevo." };
}

export async function createItemAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize();
  const { input, context, errors } = parseItemForm(formData, { withInitialStock: true });
  if (errors) return { ...context, errors };

  let itemId: string;
  try {
    itemId = await createItem(tenantId, actor, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  redirect(`/dashboard/inventory/items/${itemId}`);
}

export async function updateItemAction(itemId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize();
  const { input, context, errors } = parseItemForm(formData, { withInitialStock: false });
  if (errors) return { ...context, errors };

  try {
    await updateItem(tenantId, actor, itemId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  redirect(`/dashboard/inventory/items/${itemId}`);
}

export async function setItemActiveAction(itemId: string, active: boolean) {
  const { tenantId } = await authorize();
  await setItemActive(tenantId, itemId, active);
  refresh();
}

export async function recordMovementAction(itemId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId, actor } = await authorize();
  const { input, context, errors } = parseMovementForm(formData);
  if (errors) return { ...context, errors };

  let stock: number;
  try {
    stock = await recordMovement(tenantId, actor, itemId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: `Movimiento registrado. Existencias actuales: ${stock}.` };
}

export async function createCategoryAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId } = await authorize();
  const { input, context, errors } = parseCategoryForm(formData);
  if (errors) return { ...context, errors };

  try {
    await createCategory(tenantId, input.name);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Categoría creada." };
}

export async function renameCategoryAction(
  categoryId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenantId } = await authorize();
  const { input, context, errors } = parseCategoryForm(formData);
  if (errors) return { ...context, errors };

  try {
    await renameCategory(tenantId, categoryId, input.name);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Categoría actualizada." };
}

export async function deleteCategoryAction(categoryId: string): Promise<FormState> {
  const { tenantId } = await authorize();

  try {
    await deleteCategory(tenantId, categoryId);
  } catch (error) {
    return toErrorState(error);
  }

  refresh();
  return { success: "Categoría borrada." };
}

export async function createSupplierAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { tenantId } = await authorize();
  const { input, context, errors } = parseSupplierForm(formData);
  if (errors) return { ...context, errors };

  try {
    await createSupplier(tenantId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Proveedor creado." };
}

export async function updateSupplierAction(
  supplierId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenantId } = await authorize();
  const { input, context, errors } = parseSupplierForm(formData);
  if (errors) return { ...context, errors };

  try {
    await updateSupplier(tenantId, supplierId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  refresh();
  return { success: "Proveedor actualizado." };
}

export async function setSupplierActiveAction(supplierId: string, active: boolean) {
  const { tenantId } = await authorize();
  await setSupplierActive(tenantId, supplierId, active);
  refresh();
}
