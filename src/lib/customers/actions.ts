"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyTenantPermission, requireTenantPermission } from "@/lib/auth/session";
import {
  CustomerError,
  createCustomer,
  searchCustomerOptions,
  setCustomerActive,
  updateCustomer,
  type CustomerOption,
} from "@/lib/customers/core";
import { parseCustomerForm } from "@/lib/customers/form";
import type { FormState } from "@/lib/form-state";

// Acciones de clientes. Quien vende puede dar de alta clientes; editar y archivar
// requiere "Gestionar clientes".

type Context = { fields?: Record<string, string>; selections?: Record<string, string[]> };

function toErrorState(error: unknown, context: Context): FormState {
  if (error instanceof CustomerError) return { ...context, message: error.message };
  console.error("Error al guardar el cliente:", error);
  return { ...context, message: "No pudimos guardar el cliente. Inténtalo de nuevo." };
}

export async function searchCustomersAction(query: string): Promise<CustomerOption[]> {
  const session = await requireAnyTenantPermission([
    "customers.manage",
    "sales.create",
    "cash.view",
    "orders.intake",
    "orders.view",
  ]);
  return searchCustomerOptions(session.tenant.id, typeof query === "string" ? query : "");
}

export type QuickCustomerState = (NonNullable<FormState> & { customer?: CustomerOption }) | undefined;

// Alta rápida desde la caja: devuelve el cliente para seleccionarlo en la venta.
export async function quickCreateCustomerAction(
  _prevState: QuickCustomerState,
  formData: FormData,
): Promise<QuickCustomerState> {
  const session = await requireAnyTenantPermission(["customers.manage", "sales.create", "orders.intake"]);
  const { input, context, errors } = parseCustomerForm(formData, { withBilling: false });
  if (errors) return { ...context, errors };

  try {
    const customer = await createCustomer(session.tenant.id, input);
    return { success: "Cliente registrado.", customer };
  } catch (error) {
    return toErrorState(error, context);
  }
}

export async function createCustomerAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAnyTenantPermission(["customers.manage", "sales.create", "orders.intake"]);
  const { input, context, errors } = parseCustomerForm(formData, { withBilling: true });
  if (errors) return { ...context, errors };

  let customerId: string;
  try {
    customerId = (await createCustomer(session.tenant.id, input)).value;
  } catch (error) {
    return toErrorState(error, context);
  }

  redirect(`/dashboard/customers/${customerId}`);
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireTenantPermission("customers.manage");
  const { input, context, errors } = parseCustomerForm(formData, { withBilling: true });
  if (errors) return { ...context, errors };

  try {
    await updateCustomer(session.tenant.id, customerId, input);
  } catch (error) {
    return toErrorState(error, context);
  }

  redirect(`/dashboard/customers/${customerId}`);
}

export async function setCustomerActiveAction(customerId: string, active: boolean) {
  const session = await requireTenantPermission("customers.manage");
  await setCustomerActive(session.tenant.id, customerId, active);
  refresh();
}
