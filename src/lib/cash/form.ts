import type { BankAccountInput } from "@/lib/cash/core";
import { readField } from "@/lib/validation";

// Lectura y validación de formularios de la Caja. Sin dependencias de servidor:
// el formulario de cobro también la usa para calcular en vivo.

// Solo dígitos con punto decimal y hasta 2 decimales, sin comas ni signos.
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

// "150", "150.5" o "150.50" → centavos. Formato inválido o vacío → null.
export function parseMoneyCents(raw: string): number | null {
  const value = raw.trim();
  if (!MONEY_PATTERN.test(value)) return null;
  const [integer, decimals = ""] = value.split(".");
  return Number(integer) * 100 + Number(decimals.padEnd(2, "0"));
}

// Dígito verificador de la CLABE: pesos 3, 7, 1 sobre los primeros 17 dígitos.
export function isValidClabe(clabe: string) {
  if (!/^\d{18}$/.test(clabe)) return false;
  const weights = [3, 7, 1];
  const sum = [...clabe.slice(0, 17)].reduce(
    (total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(clabe[17]);
}

export function parseBankAccountForm(formData: FormData): {
  input: BankAccountInput;
  context: { fields: Record<string, string> };
  errors?: Record<string, string>;
} {
  const fields = {
    bankName: readField(formData, "bankName", 60),
    holderName: readField(formData, "holderName", 120),
    clabe: readField(formData, "clabe", 30).replace(/\D/g, ""),
    alias: readField(formData, "alias", 60),
  };
  const errors: Record<string, string> = {};

  if (!fields.bankName) errors.bankName = "Escribe el banco.";
  if (!fields.holderName) errors.holderName = "Escribe el nombre del titular.";
  if (fields.clabe.length !== 18) errors.clabe = "La CLABE debe tener 18 dígitos.";
  else if (!isValidClabe(fields.clabe)) errors.clabe = "La CLABE no es válida; revisa los dígitos.";

  return Object.keys(errors).length > 0
    ? { input: fields, context: { fields }, errors }
    : { input: fields, context: { fields } };
}
