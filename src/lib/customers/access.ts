import type { Permission } from "@/lib/permissions";

// Quien tenga alguno de estos permisos puede consultar clientes.
export const CUSTOMER_ACCESS_PERMISSIONS: Permission[] = [
  "customers.manage",
  "sales.create",
  "cash.view",
  "orders.intake",
  "orders.view",
];
