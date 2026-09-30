import { parseMoneyCents } from "@/lib/cash/form";
import { isValidDay } from "@/lib/dates";
import { parseChargeRequest } from "@/lib/cash/payment-request";
import type { IntakePart, OrderInput, OrderIntake, PartToGetInput } from "@/lib/orders/core";
import {
  LABOR_TAX_RATES,
  isIntakeType,
  isUnlockType,
  parsePattern,
  type IntakeType,
  type UnlockType,
} from "@/lib/orders/labels";
import { UUID_PATTERN, readField } from "@/lib/validation";

// Lectura y validación del formulario de recepción de equipos.
export function parseOrderForm(formData: FormData): {
  input: OrderInput;
  context: { fields: Record<string, string> };
  errors?: Record<string, string>;
} {
  const fields = {
    customerId: readField(formData, "customerId", 36),
    customerLabel: readField(formData, "customerLabel", 200),
    deviceType: readField(formData, "deviceType", 40),
    brand: readField(formData, "brand", 60),
    model: readField(formData, "model", 80),
    serialNumber: readField(formData, "serialNumber", 40),
    color: readField(formData, "color", 40),
    unlockType: readField(formData, "unlockType", 10),
    unlockCode: readField(formData, "unlockCode", 60),
    accessories: readField(formData, "accessories", 300),
    deviceCondition: readField(formData, "deviceCondition", 500),
    reportedIssue: readField(formData, "reportedIssue", 1000),
    estimatedCost: readField(formData, "estimatedCost", 20),
    promisedOn: readField(formData, "promisedOn", 10),
  };
  const errors: Record<string, string> = {};

  if (!UUID_PATTERN.test(fields.customerId)) errors.customerId = "Elige o registra al cliente.";
  if (!fields.deviceType) errors.deviceType = "Elige el tipo de equipo.";
  if (!fields.reportedIssue) errors.reportedIssue = "Describe la falla que reporta el cliente.";

  const estimatedCents = fields.estimatedCost ? parseMoneyCents(fields.estimatedCost) : null;
  if (fields.estimatedCost && estimatedCents === null) errors.estimatedCost = "Usa un importe como 850 o 850.50.";

  if (fields.promisedOn && !isValidDay(fields.promisedOn)) errors.promisedOn = "Fecha no válida.";

  const unlockType: UnlockType = isUnlockType(fields.unlockType) ? fields.unlockType : "none";
  const unlockCode = unlockType === "none" ? "" : fields.unlockCode;
  if (unlockType === "pin" && !/^\d{4,16}$/.test(unlockCode)) {
    errors.unlockCode = "El PIN debe tener de 4 a 16 dígitos.";
  } else if (unlockType === "password" && !unlockCode) {
    errors.unlockCode = "Escribe la contraseña.";
  } else if (unlockType === "pattern" && !parsePattern(unlockCode)) {
    errors.unlockCode = "Dibuja un patrón de al menos 4 puntos.";
  }

  const input: OrderInput = {
    customerId: fields.customerId,
    deviceType: fields.deviceType,
    brand: fields.brand,
    model: fields.model,
    serialNumber: fields.serialNumber,
    color: fields.color,
    unlockType,
    unlockCode,
    accessories: fields.accessories,
    deviceCondition: fields.deviceCondition,
    reportedIssue: fields.reportedIssue,
    estimatedCents,
    promisedOn: fields.promisedOn || null,
  };

  return Object.keys(errors).length > 0 ? { input, context: { fields }, errors } : { input, context: { fields } };
}

const MAX_INTAKE_PARTS = 20;

// Refacciones del inventario elegidas al recibir: JSON [{ itemId, quantity }]. El precio nunca
// viaja desde el navegador; lo calcula el servidor con el artículo. null si no es válido.
function parseIntakeParts(raw: string): IntakePart[] | null {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length > MAX_INTAKE_PARTS) return null;
  const parts: IntakePart[] = [];
  for (const entry of value) {
    const itemId = typeof entry?.itemId === "string" ? entry.itemId : "";
    const quantity = entry?.quantity;
    if (!UUID_PATTERN.test(itemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return null;
    parts.push({ itemId, quantity });
  }
  return parts;
}

// Refacciones por conseguir: JSON [{ itemId, description, quantity }]. Con `itemId` el nombre lo
// pone el servidor con el artículo; sin él, la descripción capturada. Nunca llevan precio.
// Sin el módulo de Inventario solo se aceptan piezas descritas a mano. null si no es válido.
function parsePartsToGet(raw: string, hasInventory: boolean): PartToGetInput[] | null {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length > MAX_INTAKE_PARTS) return null;
  const parts: PartToGetInput[] = [];
  for (const entry of value) {
    const itemId = typeof entry?.itemId === "string" ? entry.itemId : null;
    const description = typeof entry?.description === "string" ? entry.description.trim() : "";
    const quantity = entry?.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return null;
    if (itemId !== null) {
      if (!hasInventory || !UUID_PATTERN.test(itemId)) return null;
      parts.push({ itemId, description: "", quantity });
    } else {
      if (description.length < 1 || description.length > 150) return null;
      parts.push({ itemId: null, description, quantity });
    }
  }
  return parts;
}

// Tipo de ingreso, refacción y cobro de la recepción. El cobro llega como JSON (ChargeRequest) en
// `intakePayment` y solo se lee si quien recibe puede cobrar. Los campos de refacción solo se leen
// para el tipo que los usa: en existencia, los artículos elegidos (o, sin el módulo de Inventario,
// la refacción capturada a mano); por conseguir, la lista de piezas sin precio. Los importes
// capturados a mano solo se aceptan de quien puede ver precios.
export function parseIntakeForm(
  formData: FormData,
  options: { canCollect: boolean; canSeePrices: boolean; hasInventory: boolean },
): {
  intake: OrderIntake;
  fields: Record<string, string>;
  selections: Record<string, string[]>;
  errors?: Record<string, string>;
  message?: string;
} {
  const fields = {
    intakeType: readField(formData, "intakeType", 20),
    diagnosisFee: readField(formData, "diagnosisFee", 20),
    partDescription: readField(formData, "partDescription", 150),
    partQuantity: readField(formData, "partQuantity", 6),
    price: options.canSeePrices ? readField(formData, "price", 20) : "",
    taxRate: options.canSeePrices ? readField(formData, "taxRate", 3) : "16",
    // Se regresa al formulario si hay errores para no perder la lista.
    partsToGet: readField(formData, "partsToGet", 10000),
  };
  const taxIncluded = options.canSeePrices ? formData.get("taxIncluded") === "on" : true;
  const selections = { taxIncluded: taxIncluded ? ["on"] : [] };
  const errors: Record<string, string> = {};

  const type: IntakeType = isIntakeType(fields.intakeType) ? fields.intakeType : "in_stock";
  if (!isIntakeType(fields.intakeType)) errors.intakeType = "Elige el tipo de ingreso.";

  let parts: IntakePart[] = [];
  let freePart: OrderIntake["freePart"] = null;
  let partsToGet: PartToGetInput[] = [];
  if (type === "in_stock" && isIntakeType(fields.intakeType)) {
    if (options.hasInventory) {
      const parsed = parseIntakeParts(readField(formData, "intakeParts", 5000));
      if (parsed === null) errors.intakeParts = "Vuelve a elegir las refacciones.";
      else if (parsed.length === 0) errors.intakeParts = "Elige la refacción que se va a cambiar.";
      else parts = parsed;
    } else {
      if (!fields.partDescription) errors.partDescription = "Describe la refacción, por ejemplo “Pantalla iPhone 11”.";
      const quantityOk =
        /^\d{1,4}$/.test(fields.partQuantity) && Number(fields.partQuantity) >= 1 && Number(fields.partQuantity) <= 1000;
      if (!quantityOk) errors.partQuantity = "Escribe una cantidad entre 1 y 1000.";
      const priceCents = options.canSeePrices ? parseMoneyCents(fields.price) : 0;
      if (priceCents === null) errors.price = "Usa un importe como 350 o 350.50.";
      if (!LABOR_TAX_RATES.includes(fields.taxRate)) errors.taxRate = "Elige el IVA.";
      freePart = {
        description: fields.partDescription,
        quantity: quantityOk ? Number(fields.partQuantity) : 1,
        priceCents: priceCents ?? 0,
        taxRate: Number(fields.taxRate),
        taxIncluded,
      };
    }
  } else if (type === "order_part") {
    const parsed = parsePartsToGet(fields.partsToGet, options.hasInventory);
    if (parsed === null) errors.partsToGet = "Revisa las refacciones por conseguir.";
    else if (parsed.length === 0) errors.partsToGet = "Anota la refacción que hay que conseguir.";
    else partsToGet = parsed;
  }

  let diagnosisFeeCents = 0;
  if (type === "diagnosis") {
    // Vacío = diagnóstico gratis, igual que en el formulario.
    const parsed = fields.diagnosisFee === "" ? 0 : parseMoneyCents(fields.diagnosisFee);
    if (parsed === null) errors.diagnosisFee = "Usa un importe como 150 o 150.50 (0 si es gratis).";
    else diagnosisFeeCents = parsed;
  }

  let payment: OrderIntake["payment"] = null;
  let message: string | undefined;
  const raw = options.canCollect ? readField(formData, "intakePayment", 5000) : "";
  if (raw) {
    let request: unknown = null;
    try {
      request = JSON.parse(raw);
    } catch {
      request = null;
    }
    const parsed = parseChargeRequest(request);
    if ("message" in parsed) message = parsed.message;
    else if (parsed.payments.length > 0) payment = parsed;
  }

  const intake: OrderIntake = {
    type,
    diagnosisFeeCents,
    payment,
    canCollect: options.canCollect,
    parts,
    freePart,
    partsToGet,
  };
  return Object.keys(errors).length > 0 || message
    ? { intake, fields, selections, errors, message }
    : { intake, fields, selections };
}
