import "server-only";
import type { PoolClient } from "pg";
import { isUniqueViolation } from "@/lib/db";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Datos del inventario. Todo corre en el schema del taller (withTenantDb), así que las
// consultas no filtran por taller. No verifican la sesión: la acción o página que
// llama ya comprobó los permisos.

export type ItemFilter = "all" | "low" | "sale" | "parts" | "archived";

export type MovementKind = "initial" | "purchase" | "adjustment" | "sale" | "repair" | "repair_return" | "return";

export type InventoryActor = { userId: string; userName: string };

export type ItemSummary = {
  id: string;
  name: string;
  barcode: string | null;
  isForSale: boolean;
  isRepairPart: boolean;
  trackStock: boolean;
  categoryName: string | null;
  salePrice: string;
  taxRate: string;
  taxIncluded: boolean;
  stock: number;
  minStock: number;
  isActive: boolean;
};

export type ItemDetail = ItemSummary & {
  description: string;
  categoryId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchasePrice: string;
  laborPrice: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StockMovement = {
  id: string;
  kind: MovementKind;
  quantity: number;
  stockAfter: number;
  unitCost: string | null;
  supplierName: string | null;
  note: string;
  userName: string;
  createdAt: Date;
};

export type ItemCounts = Record<ItemFilter, number>;

export type ItemInput = {
  name: string;
  description: string;
  barcode: string | null;
  isForSale: boolean;
  isRepairPart: boolean;
  trackStock: boolean;
  categoryId: string | null;
  supplierId: string | null;
  purchasePrice: string;
  salePrice: string;
  taxRate: string;
  taxIncluded: boolean;
  minStock: number;
  // Mano de obra que se cobra junto con la refacción en las órdenes (0 si no es refacción).
  laborPrice: string;
};

export type MovementInput = {
  kind: "purchase" | "adjustment";
  quantity: number;
  unitCost: string | null;
  supplierId: string | null;
  note: string;
  updatePurchasePrice: boolean;
};

export type Category = { id: string; name: string; itemCount: number };

export type SupplierInput = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  taxId: string;
  address: string;
  notes: string;
};

export type Supplier = SupplierInput & { id: string; isActive: boolean; itemCount: number };

// Error con un mensaje apto para mostrarse en la interfaz.
export class InventoryError extends Error {}

export class BarcodeTakenError extends InventoryError {
  constructor() {
    super("Ya existe un artículo con este código de barras.");
  }
}

export class NameTakenError extends InventoryError {}

function assertIds(...ids: (string | null)[]) {
  if (ids.some((id) => id !== null && !UUID_PATTERN.test(id))) throw new InventoryError("Solicitud no válida.");
}

function translateError(error: unknown): never {
  if (isUniqueViolation(error, "items_barcode_key")) throw new BarcodeTakenError();
  if (isUniqueViolation(error, "categories_name_key")) throw new NameTakenError("Ya existe una categoría con este nombre.");
  if (isUniqueViolation(error, "suppliers_name_key")) throw new NameTakenError("Ya existe un proveedor con este nombre.");
  if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") {
    throw new InventoryError("La categoría o el proveedor elegido ya no existe.");
  }
  throw error;
}

type ItemRow = {
  id: string;
  name: string;
  barcode: string | null;
  is_for_sale: boolean;
  is_repair_part: boolean;
  track_stock: boolean;
  category_name: string | null;
  sale_price: string;
  tax_rate: string;
  tax_included: boolean;
  stock: number;
  min_stock: number;
  is_active: boolean;
};

const ITEM_SUMMARY_COLUMNS = `i.id, i.name, i.barcode, i.is_for_sale, i.is_repair_part, i.track_stock, c.name AS category_name,
  i.sale_price, i.tax_rate, i.tax_included, i.stock, i.min_stock, i.is_active`;

function mapSummary(row: ItemRow): ItemSummary {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    isForSale: row.is_for_sale,
    isRepairPart: row.is_repair_part,
    trackStock: row.track_stock,
    categoryName: row.category_name,
    salePrice: row.sale_price,
    taxRate: row.tax_rate,
    taxIncluded: row.tax_included,
    stock: row.stock,
    minStock: row.min_stock,
    isActive: row.is_active,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listItems(
  tenantId: string,
  options: { search: string; filter: ItemFilter },
): Promise<{ items: ItemSummary[]; counts: ItemCounts }> {
  return withTenantDb(tenantId, async (client) => {
    const conditions = [options.filter === "archived" ? "NOT i.is_active" : "i.is_active"];
    if (options.filter === "low") conditions.push("i.track_stock AND (i.stock = 0 OR i.stock <= i.min_stock)");
    if (options.filter === "sale") conditions.push("i.is_for_sale");
    if (options.filter === "parts") conditions.push("i.is_repair_part");

    const params: string[] = [];
    if (options.search) {
      params.push(`%${escapeLike(options.search)}%`, options.search);
      conditions.push("(i.name ILIKE $1 OR i.description ILIKE $1 OR i.barcode = $2)");
    }

    const { rows } = await client.query<ItemRow>(
      `SELECT ${ITEM_SUMMARY_COLUMNS}
         FROM items i
         LEFT JOIN categories c ON c.id = i.category_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY lower(i.name)
        LIMIT 500`,
      params,
    );

    const { rows: countRows } = await client.query<{
      all_count: number;
      low_count: number;
      sale_count: number;
      parts_count: number;
      archived_count: number;
    }>(
      `SELECT count(*) FILTER (WHERE is_active)::int AS all_count,
              count(*) FILTER (WHERE is_active AND track_stock AND (stock = 0 OR stock <= min_stock))::int AS low_count,
              count(*) FILTER (WHERE is_active AND is_for_sale)::int AS sale_count,
              count(*) FILTER (WHERE is_active AND is_repair_part)::int AS parts_count,
              count(*) FILTER (WHERE NOT is_active)::int AS archived_count
         FROM items`,
    );
    const counts = countRows[0];

    return {
      items: rows.map(mapSummary),
      counts: {
        all: counts.all_count,
        low: counts.low_count,
        sale: counts.sale_count,
        parts: counts.parts_count,
        archived: counts.archived_count,
      },
    };
  });
}

export async function getItem(
  tenantId: string,
  itemId: string,
): Promise<{ item: ItemDetail; movements: StockMovement[] } | null> {
  if (!UUID_PATTERN.test(itemId)) return null;

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<
      ItemRow & {
        description: string;
        category_id: string | null;
        supplier_id: string | null;
        supplier_name: string | null;
        purchase_price: string;
        labor_price: string;
        created_at: Date;
        updated_at: Date;
      }
    >(
      `SELECT ${ITEM_SUMMARY_COLUMNS}, i.description, i.category_id, i.supplier_id, s.name AS supplier_name,
              i.purchase_price, i.labor_price, i.created_at, i.updated_at
         FROM items i
         LEFT JOIN categories c ON c.id = i.category_id
         LEFT JOIN suppliers s ON s.id = i.supplier_id
        WHERE i.id = $1`,
      [itemId],
    );
    const row = rows[0];
    if (!row) return null;

    const { rows: movementRows } = await client.query<{
      id: string;
      kind: MovementKind;
      quantity: number;
      stock_after: number;
      unit_cost: string | null;
      supplier_name: string | null;
      note: string;
      user_name: string;
      created_at: Date;
    }>(
      `SELECT m.id, m.kind, m.quantity, m.stock_after, m.unit_cost, s.name AS supplier_name,
              m.note, m.user_name, m.created_at
         FROM stock_movements m
         LEFT JOIN suppliers s ON s.id = m.supplier_id
        WHERE m.item_id = $1
        ORDER BY m.created_at DESC
        LIMIT 100`,
      [itemId],
    );

    return {
      item: {
        ...mapSummary(row),
        description: row.description,
        categoryId: row.category_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        purchasePrice: row.purchase_price,
        laborPrice: row.labor_price,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      movements: movementRows.map((movement) => ({
        id: movement.id,
        kind: movement.kind,
        quantity: movement.quantity,
        stockAfter: movement.stock_after,
        unitCost: movement.unit_cost,
        supplierName: movement.supplier_name,
        note: movement.note,
        userName: movement.user_name,
        createdAt: movement.created_at,
      })),
    };
  });
}

// Cambia existencias y deja el movimiento en el historial, en la misma transacción.
// El UPDATE condicionado impide existencias negativas incluso con operaciones simultáneas.
async function applyMovement(
  client: PoolClient,
  actor: InventoryActor,
  itemId: string,
  movement: { kind: MovementKind; quantity: number; unitCost: string | null; supplierId: string | null; note: string },
  options: { requireActive: boolean } = { requireActive: true },
) {
  // Solo artículos que controlan existencias. Los módulos futuros (ventas, reparaciones)
  // deben omitir el movimiento cuando el artículo no controla existencias.
  const { rows } = await client.query<{ stock: number }>(
    `UPDATE items SET stock = stock + $1
      WHERE id = $2 AND track_stock AND (is_active OR NOT $3) AND stock + $1 >= 0
      RETURNING stock`,
    [movement.quantity, itemId, options.requireActive],
  );
  const stock = rows[0]?.stock;

  if (stock === undefined) {
    const { rows: itemRows } = await client.query<{ is_active: boolean; track_stock: boolean }>(
      "SELECT is_active, track_stock FROM items WHERE id = $1",
      [itemId],
    );
    const item = itemRows[0];
    if (!item) throw new InventoryError("El artículo ya no existe.");
    if (!item.track_stock) throw new InventoryError("Este artículo no controla existencias.");
    if (options.requireActive && !item.is_active) {
      throw new InventoryError("Reactiva el artículo para registrar movimientos.");
    }
    throw new InventoryError("No hay suficientes existencias para esa salida.");
  }

  await client.query(
    `INSERT INTO stock_movements (item_id, kind, quantity, stock_after, unit_cost, supplier_id, note, user_id, user_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      itemId,
      movement.kind,
      movement.quantity,
      stock,
      movement.unitCost,
      movement.supplierId,
      movement.note,
      actor.userId,
      actor.userName,
    ],
  );

  return stock;
}

export async function createItem(tenantId: string, actor: InventoryActor, input: ItemInput & { initialStock: number }) {
  assertIds(input.categoryId, input.supplierId);

  try {
    return await withTenantDb(tenantId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO items (name, description, barcode, is_for_sale, is_repair_part, category_id, supplier_id,
                            purchase_price, sale_price, min_stock, track_stock, tax_rate, tax_included, labor_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          input.name,
          input.description,
          input.barcode,
          input.isForSale,
          input.isRepairPart,
          input.categoryId,
          input.supplierId,
          input.purchasePrice,
          input.salePrice,
          input.minStock,
          input.trackStock,
          input.taxRate,
          input.taxIncluded,
          input.laborPrice,
        ],
      );
      const itemId = rows[0].id;

      if (input.trackStock && input.initialStock > 0) {
        await applyMovement(client, actor, itemId, {
          kind: "initial",
          quantity: input.initialStock,
          unitCost: input.purchasePrice,
          supplierId: input.supplierId,
          note: "Existencia inicial",
        });
      }

      return itemId;
    });
  } catch (error) {
    translateError(error);
  }
}

export async function updateItem(tenantId: string, actor: InventoryActor, itemId: string, input: ItemInput) {
  assertIds(itemId, input.categoryId, input.supplierId);

  try {
    await withTenantDb(tenantId, async (client) => {
      const { rows } = await client.query<{ stock: number; track_stock: boolean }>(
        "SELECT stock, track_stock FROM items WHERE id = $1 FOR UPDATE",
        [itemId],
      );
      const current = rows[0];
      if (!current) throw new InventoryError("El artículo ya no existe.");

      // Al dejar de controlar existencias se ponen en 0 con un ajuste, para que el historial cuadre.
      if (current.track_stock && !input.trackStock && current.stock > 0) {
        await applyMovement(
          client,
          actor,
          itemId,
          {
            kind: "adjustment",
            quantity: -current.stock,
            unitCost: null,
            supplierId: null,
            note: "Se dejó de controlar existencias",
          },
          { requireActive: false },
        );
      }

      await client.query(
        `UPDATE items
            SET name = $1, description = $2, barcode = $3, is_for_sale = $4, is_repair_part = $5,
                category_id = $6, supplier_id = $7, purchase_price = $8, sale_price = $9, min_stock = $10,
                track_stock = $11, tax_rate = $12, tax_included = $13, labor_price = $15
          WHERE id = $14`,
        [
          input.name,
          input.description,
          input.barcode,
          input.isForSale,
          input.isRepairPart,
          input.categoryId,
          input.supplierId,
          input.purchasePrice,
          input.salePrice,
          input.minStock,
          input.trackStock,
          input.taxRate,
          input.taxIncluded,
          itemId,
          input.laborPrice,
        ],
      );
    });
  } catch (error) {
    translateError(error);
  }
}

// Los artículos se archivan en lugar de borrarse para conservar su historial.
export async function setItemActive(tenantId: string, itemId: string, active: boolean) {
  assertIds(itemId);
  await withTenantDb(tenantId, (client) => client.query("UPDATE items SET is_active = $1 WHERE id = $2", [active, itemId]));
}

export async function recordMovement(tenantId: string, actor: InventoryActor, itemId: string, input: MovementInput) {
  assertIds(itemId, input.supplierId);

  try {
    return await withTenantDb(tenantId, async (client) => {
      const stock = await applyMovement(client, actor, itemId, input);
      if (input.kind === "purchase" && input.unitCost !== null && input.updatePurchasePrice) {
        await client.query("UPDATE items SET purchase_price = $1 WHERE id = $2", [input.unitCost, itemId]);
      }
      return stock;
    });
  } catch (error) {
    translateError(error);
  }
}

export async function listCategories(tenantId: string): Promise<Category[]> {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{ id: string; name: string; item_count: number }>(
      `SELECT c.id, c.name,
              (SELECT count(*)::int FROM items i WHERE i.category_id = c.id AND i.is_active) AS item_count
         FROM categories c
        ORDER BY lower(c.name)`,
    );
    return rows.map((row) => ({ id: row.id, name: row.name, itemCount: row.item_count }));
  });
}

export async function createCategory(tenantId: string, name: string) {
  try {
    await withTenantDb(tenantId, (client) => client.query("INSERT INTO categories (name) VALUES ($1)", [name]));
  } catch (error) {
    translateError(error);
  }
}

export async function renameCategory(tenantId: string, categoryId: string, name: string) {
  assertIds(categoryId);
  try {
    await withTenantDb(tenantId, async (client) => {
      const { rowCount } = await client.query("UPDATE categories SET name = $1 WHERE id = $2", [name, categoryId]);
      if (!rowCount) throw new InventoryError("La categoría ya no existe.");
    });
  } catch (error) {
    translateError(error);
  }
}

// Los artículos de la categoría quedan sin categoría (ON DELETE SET NULL).
export async function deleteCategory(tenantId: string, categoryId: string) {
  assertIds(categoryId);
  await withTenantDb(tenantId, (client) => client.query("DELETE FROM categories WHERE id = $1", [categoryId]));
}

export async function listSuppliers(tenantId: string): Promise<Supplier[]> {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      name: string;
      contact_name: string;
      phone: string;
      email: string;
      tax_id: string;
      address: string;
      notes: string;
      is_active: boolean;
      item_count: number;
    }>(
      `SELECT s.id, s.name, s.contact_name, s.phone, s.email, s.tax_id, s.address, s.notes, s.is_active,
              (SELECT count(*)::int FROM items i WHERE i.supplier_id = s.id AND i.is_active) AS item_count
         FROM suppliers s
        ORDER BY s.is_active DESC, lower(s.name)`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      contactName: row.contact_name,
      phone: row.phone,
      email: row.email,
      taxId: row.tax_id,
      address: row.address,
      notes: row.notes,
      isActive: row.is_active,
      itemCount: row.item_count,
    }));
  });
}

const SUPPLIER_VALUES = (input: SupplierInput) => [
  input.name,
  input.contactName,
  input.phone,
  input.email,
  input.taxId,
  input.address,
  input.notes,
];

export async function createSupplier(tenantId: string, input: SupplierInput) {
  try {
    await withTenantDb(tenantId, (client) =>
      client.query(
        `INSERT INTO suppliers (name, contact_name, phone, email, tax_id, address, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        SUPPLIER_VALUES(input),
      ),
    );
  } catch (error) {
    translateError(error);
  }
}

export async function updateSupplier(tenantId: string, supplierId: string, input: SupplierInput) {
  assertIds(supplierId);
  try {
    await withTenantDb(tenantId, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE suppliers
            SET name = $1, contact_name = $2, phone = $3, email = $4, tax_id = $5, address = $6, notes = $7
          WHERE id = $8`,
        [...SUPPLIER_VALUES(input), supplierId],
      );
      if (!rowCount) throw new InventoryError("El proveedor ya no existe.");
    });
  } catch (error) {
    translateError(error);
  }
}

// Para otros módulos (ventas, devoluciones) que mueven existencias dentro de su propia transacción.
export const applyStockMovement = applyMovement;

// Los proveedores se archivan para no romper el historial de compras.
export async function setSupplierActive(tenantId: string, supplierId: string, active: boolean) {
  assertIds(supplierId);
  await withTenantDb(tenantId, (client) =>
    client.query("UPDATE suppliers SET is_active = $1 WHERE id = $2", [active, supplierId]),
  );
}
