// Catálogo de permisos y roles del sistema. El código revisa permisos, nunca nombres
// de rol, así los roles Custom de cada taller funcionan igual que los predefinidos.

export const PERMISSION_LABELS = {
  "reports.view": "Ver estadísticas y productividad",
  "orders.intake": "Dar ingreso a equipos",
  "orders.deliver": "Dar salida a equipos",
  "orders.view": "Ver todas las órdenes",
  "repairs.work": "Tomar equipos y reparar",
  "orders.prices": "Ver precios y cobros de reparaciones",
  "payments.collect": "Cobrar reparaciones",
  "sales.create": "Vender productos",
  "sales.refund": "Hacer devoluciones",
  "cash.operate": "Abrir y cerrar caja",
  "cash.view": "Ver ventas y cortes de caja",
  "inventory.view": "Ver inventario",
  "inventory.manage": "Gestionar inventario",
  "purchases.manage": "Registrar compras y pagos a proveedores",
  "customers.manage": "Gestionar clientes",
  "users.manage": "Gestionar usuarios",
  "roles.manage": "Gestionar roles Custom",
  "settings.manage": "Configuración del taller",
} as const;

export type Permission = keyof typeof PERMISSION_LABELS;

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Panel", permissions: ["reports.view"] },
  { label: "Órdenes y reparación", permissions: ["orders.intake", "orders.deliver", "orders.view", "orders.prices", "repairs.work"] },
  {
    label: "Caja y ventas",
    permissions: ["sales.create", "payments.collect", "sales.refund", "cash.operate", "cash.view"],
  },
  { label: "Inventario y compras", permissions: ["inventory.view", "inventory.manage", "purchases.manage"] },
  { label: "Clientes", permissions: ["customers.manage"] },
  { label: "Administración", permissions: ["users.manage", "roles.manage", "settings.manage"] },
];

export const SYSTEM_ROLE_KEYS = ["owner", "reception", "inventory", "technician", "supervisor"] as const;

export type SystemRole = (typeof SYSTEM_ROLE_KEYS)[number];

export const SYSTEM_ROLES: Record<SystemRole, { label: string; description: string; permissions: readonly Permission[] }> = {
  owner: {
    label: "Propietario",
    description: "Acceso total: estadísticas, personal, roles y configuración.",
    permissions: ALL_PERMISSIONS,
  },
  reception: {
    label: "Recepción",
    description: "Da ingreso y salida a los equipos, opera la caja, cobra reparaciones y vende productos.",
    permissions: [
      "orders.intake",
      "orders.deliver",
      "orders.view",
      "orders.prices",
      "payments.collect",
      "sales.create",
      "cash.operate",
      "customers.manage",
    ],
  },
  inventory: {
    label: "Inventario",
    description: "Da de alta artículos, registra compras a proveedores y ajusta existencias.",
    permissions: ["inventory.view", "inventory.manage", "purchases.manage"],
  },
  technician: {
    label: "Técnico",
    description: "Toma equipos de la cola y registra su reparación, sin ver precios.",
    permissions: ["repairs.work"],
  },
  supervisor: {
    label: "Supervisor",
    description: "Consulta el inventario y los movimientos de caja.",
    permissions: ["inventory.view", "cash.view"],
  },
};

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSION_LABELS, value);
}

export function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(value);
}

// Ordena y deja solo permisos conocidos (los desconocidos se ignoran).
export function normalizePermissions(values: readonly string[]): Permission[] {
  const set = new Set(values);
  return ALL_PERMISSIONS.filter((permission) => set.has(permission));
}

export function resolvePermissions(systemRoles: readonly SystemRole[], customPermissions: readonly string[]) {
  return normalizePermissions([...systemRoles.flatMap((role) => SYSTEM_ROLES[role].permissions), ...customPermissions]);
}
