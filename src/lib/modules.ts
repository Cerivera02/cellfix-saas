import type { Permission } from "@/lib/permissions";

// Módulos opcionales que se activan por taller desde el panel administrativo.
// Reparaciones, clientes y equipo forman la base y siempre están activos.
export const MODULE_KEYS = ["cash", "inventory", "purchases", "photos", "tracking"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULES: Record<
  ModuleKey,
  { label: string; description: string; requires: ModuleKey[]; permissions: Permission[] }
> = {
  cash: {
    label: "Caja",
    description: "Turnos con apertura y corte, ventas de mostrador y devoluciones. Sin caja, los cobros de órdenes se registran sin turno.",
    requires: [],
    permissions: ["sales.create", "sales.refund", "cash.operate", "cash.view"],
  },
  inventory: {
    label: "Inventario",
    description: "Artículos, categorías, proveedores y existencias. Sin inventario, las refacciones de una orden se capturan como texto libre.",
    requires: [],
    // Sin artículos no hay nada que vender en el mostrador.
    permissions: ["inventory.view", "inventory.manage", "sales.create", "sales.refund"],
  },
  purchases: {
    label: "Compras",
    description: "Compras a proveedores y sus pagos. Requiere Inventario.",
    requires: ["inventory"],
    permissions: ["purchases.manage"],
  },
  photos: {
    label: "Evidencia fotográfica",
    description: "Fotos del equipo desde el celular con un código QR.",
    requires: [],
    permissions: [],
  },
  tracking: {
    label: "Seguimiento para clientes",
    description: "Página pública con el avance, las fotos y el saldo de la orden, y su código QR en el ticket.",
    requires: [],
    permissions: [],
  },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

// Ordena, quita desconocidos y descarta los módulos cuyo requisito no está activo.
export function normalizeModules(values: readonly string[]): ModuleKey[] {
  const set = new Set(values.filter(isModuleKey));
  return MODULE_KEYS.filter((key) => set.has(key) && MODULES[key].requires.every((required) => set.has(required)));
}

export function hasModule(modules: readonly ModuleKey[], key: ModuleKey) {
  return modules.includes(key);
}

// Quita los permisos que pertenecen a módulos apagados. Así el menú, las rutas y las acciones
// (que revisan permisos) se ocultan o bloquean sin revisar módulos uno por uno.
export function filterPermissionsByModules(permissions: readonly Permission[], modules: readonly ModuleKey[]) {
  const blocked = new Set(blockedPermissions(modules));
  return permissions.filter((permission) => !blocked.has(permission));
}

// Permisos que no aplican en el taller porque su módulo está apagado.
export function blockedPermissions(modules: readonly ModuleKey[]): Permission[] {
  return [...new Set(MODULE_KEYS.filter((key) => !modules.includes(key)).flatMap((key) => MODULES[key].permissions))];
}
