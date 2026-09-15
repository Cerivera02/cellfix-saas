import type { CustomerInput } from "@/lib/customers/core";
import { CFDI_USES, GENERIC_RFCS, TAX_REGIMES, isValidRfc, normalizeRfc, personTypeFromRfc } from "@/lib/customers/sat";
import { EMAIL_PATTERN, readField } from "@/lib/validation";

// Lectura y validación del formulario de clientes (alta rápida en la caja y alta completa).

const PHONE_PATTERN = /^\+?\d{7,15}$/;

// Deja solo dígitos (y el "+" inicial si lo hay): "55 1234-5678" → "5512345678".
function normalizePhone(raw: string) {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${trimmed.startsWith("+") ? "+" : ""}${digits}` : "";
}

export function parseCustomerForm(
  formData: FormData,
  options: { withBilling: boolean },
): {
  input: CustomerInput;
  context: { fields: Record<string, string>; selections: Record<string, string[]> };
  errors?: Record<string, string>;
} {
  const fields = {
    firstName: readField(formData, "firstName", 80),
    lastName: readField(formData, "lastName", 120),
    phone: readField(formData, "phone", 30),
    email: readField(formData, "email", 200).toLowerCase(),
    notes: readField(formData, "notes", 1000),
    taxId: normalizeRfc(readField(formData, "taxId", 20)),
    legalName: readField(formData, "legalName", 250).toUpperCase().replace(/\s+/g, " "),
    taxRegime: readField(formData, "taxRegime", 3),
    taxZipCode: readField(formData, "taxZipCode", 10).replace(/\D/g, ""),
    cfdiUse: readField(formData, "cfdiUse", 4),
    billingEmail: readField(formData, "billingEmail", 200).toLowerCase(),
  };
  const requiresInvoice = options.withBilling && formData.get("requiresInvoice") === "on";
  const context = { fields, selections: { requiresInvoice: requiresInvoice ? ["on"] : [] } };
  const errors: Record<string, string> = {};

  if (!fields.firstName) errors.firstName = "Escribe el nombre.";

  const phone = normalizePhone(fields.phone);
  if (fields.phone && !PHONE_PATTERN.test(phone)) errors.phone = "Escribe un teléfono de 7 a 15 dígitos.";
  if (fields.email && !EMAIL_PATTERN.test(fields.email)) errors.email = "Escribe un correo válido.";
  if (!fields.phone && !fields.email) errors.phone = "Escribe al menos un teléfono o un correo.";

  let tax: CustomerInput["tax"] = null;
  if (requiresInvoice) {
    const person = personTypeFromRfc(fields.taxId);

    if (!isValidRfc(fields.taxId)) {
      errors.taxId = "Escribe un RFC válido: 12 caracteres para persona moral o 13 para persona física.";
    } else if (GENERIC_RFCS.includes(fields.taxId)) {
      errors.taxId = "El RFC genérico es para público en general; no se registra en un cliente.";
    }

    if (!fields.legalName) errors.legalName = "Escribe el nombre o razón social.";

    const regime = TAX_REGIMES.find((entry) => entry.code === fields.taxRegime);
    if (!regime) errors.taxRegime = "Elige el régimen fiscal.";
    else if (person && !regime.persons.includes(person)) {
      errors.taxRegime = person === "F" ? "Ese régimen no aplica a personas físicas." : "Ese régimen no aplica a personas morales.";
    }

    if (!/^\d{5}$/.test(fields.taxZipCode)) errors.taxZipCode = "Escribe el código postal de 5 dígitos.";

    const use = CFDI_USES.find((entry) => entry.code === fields.cfdiUse);
    if (!use) errors.cfdiUse = "Elige el uso del CFDI.";
    else if (person && !use.persons.includes(person)) errors.cfdiUse = "Ese uso del CFDI solo aplica a personas físicas.";

    if (fields.billingEmail && !EMAIL_PATTERN.test(fields.billingEmail)) errors.billingEmail = "Escribe un correo válido.";

    tax = {
      taxId: fields.taxId,
      legalName: fields.legalName,
      taxRegime: fields.taxRegime,
      taxZipCode: fields.taxZipCode,
      cfdiUse: fields.cfdiUse,
    };
  }

  const input: CustomerInput = {
    firstName: fields.firstName,
    lastName: fields.lastName,
    phone,
    email: fields.email,
    notes: options.withBilling ? fields.notes : "",
    billingEmail: requiresInvoice ? fields.billingEmail : "",
    tax,
  };

  return Object.keys(errors).length > 0 ? { input, context, errors } : { input, context };
}
