import { parseMoneyCents } from "@/lib/cash/form";
import { isValidDay } from "@/lib/dates";
import type { OrderInput } from "@/lib/orders/core";
import { isUnlockType, parsePattern, type UnlockType } from "@/lib/orders/labels";
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
    warrantyDays: readField(formData, "warrantyDays", 3),
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

  const warrantyDays = fields.warrantyDays === "" ? 30 : Number(fields.warrantyDays);
  if (!Number.isInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 365) {
    errors.warrantyDays = "Escribe de 0 a 365 días.";
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
    warrantyDays,
  };

  return Object.keys(errors).length > 0 ? { input, context: { fields }, errors } : { input, context: { fields } };
}
