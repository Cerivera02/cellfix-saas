export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function readField(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Las contraseñas no se recortan: los espacios también cuentan.
export function readPassword(formData: FormData, key = "password") {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function getPasswordError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Usa como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  return undefined;
}
