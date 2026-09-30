import type { ItemInput, MovementInput, SupplierInput } from "@/lib/inventory/core";
import { EMAIL_PATTERN, UUID_PATTERN, readField } from "@/lib/validation";

// Lectura y validación de los formularios del inventario.

type Context = { fields: Record<string, string>; selections?: Record<string, string[]> };

export type Parsed<T> = { input: T; context: Context; errors?: Record<string, string> };

// Solo dígitos con punto decimal y hasta 2 decimales, sin comas ni signos.
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;
const INTEGER_PATTERN = /^\d{1,7}$/;
const MONEY_ERROR = "Usa un importe como 150 o 150.50.";

function finish<T>(input: T, context: Context, errors: Record<string, string>): Parsed<T> {
  return Object.keys(errors).length > 0 ? { input, context, errors } : { input, context };
}

// Vacío → "0.00". Formato inválido → null. Se arma el texto sin pasar por flotantes.
function parseMoney(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "0.00";
  if (!MONEY_PATTERN.test(value)) return null;
  const [integer, decimals = ""] = value.split(".");
  return `${BigInt(integer).toString()}.${decimals.padEnd(2, "0")}`;
}

// Vacío → 0. Formato inválido → null.
function parseInteger(raw: string): number | null {
  if (!raw) return 0;
  return INTEGER_PATTERN.test(raw) ? Number(raw) : null;
}

const TAX_RATE_PATTERN = /^\d{1,3}(?:\.\d{1,2})?$/;

// Porcentaje de IVA entre 0 y 100. Vacío, formato inválido o fuera de rango → null.
function parseTaxRate(raw: string): string | null {
  const value = raw.trim();
  if (!TAX_RATE_PATTERN.test(value)) return null;
  const [integer, decimals = ""] = value.split(".");
  const rate = `${Number(integer)}.${decimals.padEnd(2, "0")}`;
  return Number(rate) <= 100 ? rate : null;
}

// Vacío → null. Formato inválido → undefined.
function parseOptionalId(raw: string): string | null | undefined {
  if (!raw) return null;
  return UUID_PATTERN.test(raw) ? raw.toLowerCase() : undefined;
}

export function parseItemForm(
  formData: FormData,
  options: { withInitialStock: boolean },
): Parsed<ItemInput & { initialStock: number }> {
  const fields = {
    name: readField(formData, "name", 150),
    description: readField(formData, "description", 1000),
    barcode: readField(formData, "barcode", 64),
    categoryId: readField(formData, "categoryId", 36),
    supplierId: readField(formData, "supplierId", 36),
    purchasePrice: readField(formData, "purchasePrice", 20),
    salePrice: readField(formData, "salePrice", 20),
    laborPrice: readField(formData, "laborPrice", 20),
    taxRate: readField(formData, "taxRate", 6),
    minStock: readField(formData, "minStock", 10),
    initialStock: readField(formData, "initialStock", 10),
  };
  const kinds = formData.getAll("kinds").filter((value): value is string => value === "sale" || value === "part");
  const trackStock = formData.get("trackStock") === "on";
  const taxIncluded = formData.get("taxIncluded") === "on";
  const context = {
    fields,
    selections: { kinds, trackStock: trackStock ? ["on"] : [], taxIncluded: taxIncluded ? ["on"] : [] },
  };
  const errors: Record<string, string> = {};

  if (!fields.name) errors.name = "Escribe el nombre del artículo.";
  if (kinds.length === 0) errors.kinds = "Elige al menos un tipo.";

  const categoryId = parseOptionalId(fields.categoryId);
  if (categoryId === undefined) errors.categoryId = "Categoría no válida.";
  const supplierId = parseOptionalId(fields.supplierId);
  if (supplierId === undefined) errors.supplierId = "Proveedor no válido.";

  const purchasePrice = parseMoney(fields.purchasePrice);
  if (purchasePrice === null) errors.purchasePrice = MONEY_ERROR;
  const salePrice = parseMoney(fields.salePrice);
  if (salePrice === null) errors.salePrice = MONEY_ERROR;
  // La mano de obra solo aplica a refacciones.
  const laborPrice = kinds.includes("part") ? parseMoney(fields.laborPrice) : "0.00";
  if (laborPrice === null) errors.laborPrice = MONEY_ERROR;
  const taxRate = parseTaxRate(fields.taxRate);
  if (taxRate === null) errors.taxRate = "Usa un porcentaje entre 0 y 100 (0 si no lleva IVA).";

  // Sin control de existencias no aplican stock mínimo ni existencia inicial.
  const minStock = trackStock ? parseInteger(fields.minStock) : 0;
  if (minStock === null) errors.minStock = "Usa un número entero.";
  const initialStock = trackStock && options.withInitialStock ? parseInteger(fields.initialStock) : 0;
  if (initialStock === null) errors.initialStock = "Usa un número entero.";

  return finish(
    {
      name: fields.name,
      description: fields.description,
      barcode: fields.barcode || null,
      isForSale: kinds.includes("sale"),
      isRepairPart: kinds.includes("part"),
      trackStock,
      categoryId: categoryId ?? null,
      supplierId: supplierId ?? null,
      purchasePrice: purchasePrice ?? "0.00",
      salePrice: salePrice ?? "0.00",
      laborPrice: laborPrice ?? "0.00",
      taxRate: taxRate ?? "16.00",
      taxIncluded,
      minStock: minStock ?? 0,
      initialStock: initialStock ?? 0,
    },
    context,
    errors,
  );
}

export type MovementType = "purchase" | "adjustment_in" | "adjustment_out";

export function parseMovementForm(formData: FormData): Parsed<MovementInput> {
  const fields = {
    movementType: readField(formData, "movementType", 20),
    quantity: readField(formData, "quantity", 10),
    unitCost: readField(formData, "unitCost", 20),
    supplierId: readField(formData, "supplierId", 36),
    note: readField(formData, "note", 300),
  };
  const updatePurchasePrice = formData.get("updatePurchasePrice") === "on";
  const context = { fields, selections: { updatePurchasePrice: updatePurchasePrice ? ["on"] : [] } };
  const errors: Record<string, string> = {};

  const type = fields.movementType as MovementType;
  if (!["purchase", "adjustment_in", "adjustment_out"].includes(type)) {
    errors.movementType = "Elige el tipo de movimiento.";
  }

  const quantity = parseInteger(fields.quantity);
  if (quantity === null || quantity < 1) errors.quantity = "Escribe una cantidad mayor a 0.";

  const isPurchase = type === "purchase";
  const unitCost = isPurchase && fields.unitCost ? parseMoney(fields.unitCost) : null;
  if (isPurchase && fields.unitCost && unitCost === null) errors.unitCost = MONEY_ERROR;

  const supplierId = isPurchase ? parseOptionalId(fields.supplierId) : null;
  if (supplierId === undefined) errors.supplierId = "Proveedor no válido.";

  if (!isPurchase && !fields.note) errors.note = "Explica el motivo del ajuste.";

  return finish(
    {
      kind: isPurchase ? "purchase" : "adjustment",
      quantity: (type === "adjustment_out" ? -1 : 1) * (quantity ?? 0),
      unitCost,
      supplierId: supplierId ?? null,
      note: fields.note,
      updatePurchasePrice: isPurchase && updatePurchasePrice && unitCost !== null,
    },
    context,
    errors,
  );
}

export function parseSupplierForm(formData: FormData): Parsed<SupplierInput> {
  const fields = {
    name: readField(formData, "name", 120),
    contactName: readField(formData, "contactName", 120),
    phone: readField(formData, "phone", 30),
    email: readField(formData, "email", 200).toLowerCase(),
    taxId: readField(formData, "taxId", 20).toUpperCase(),
    address: readField(formData, "address", 300),
    notes: readField(formData, "notes", 1000),
  };
  const errors: Record<string, string> = {};

  if (!fields.name) errors.name = "Escribe el nombre del proveedor.";
  if (fields.email && !EMAIL_PATTERN.test(fields.email)) errors.email = "Escribe un correo válido.";

  return finish(fields, { fields }, errors);
}

export function parseCategoryForm(formData: FormData): Parsed<{ name: string }> {
  const fields = { name: readField(formData, "name", 60) };
  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Escribe el nombre de la categoría.";
  return finish(fields, { fields }, errors);
}
