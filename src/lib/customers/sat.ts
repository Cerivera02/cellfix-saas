// Catálogos del SAT para el receptor de un CFDI 4.0 y validación de RFC.
// Tipo de persona: F = física (RFC de 13 caracteres), M = moral (RFC de 12).

export type PersonType = "F" | "M";

type CatalogEntry = { code: string; label: string; persons: PersonType[] };

// c_RegimenFiscal
export const TAX_REGIMES: CatalogEntry[] = [
  { code: "601", label: "General de Ley Personas Morales", persons: ["M"] },
  { code: "603", label: "Personas Morales con Fines no Lucrativos", persons: ["M"] },
  { code: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios", persons: ["F"] },
  { code: "606", label: "Arrendamiento", persons: ["F"] },
  { code: "607", label: "Régimen de Enajenación o Adquisición de Bienes", persons: ["F"] },
  { code: "608", label: "Demás ingresos", persons: ["F"] },
  { code: "610", label: "Residentes en el Extranjero sin Establecimiento Permanente en México", persons: ["F", "M"] },
  { code: "611", label: "Ingresos por Dividendos (socios y accionistas)", persons: ["F"] },
  { code: "612", label: "Personas Físicas con Actividades Empresariales y Profesionales", persons: ["F"] },
  { code: "614", label: "Ingresos por intereses", persons: ["F"] },
  { code: "615", label: "Régimen de los ingresos por obtención de premios", persons: ["F"] },
  { code: "616", label: "Sin obligaciones fiscales", persons: ["F"] },
  { code: "620", label: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", persons: ["M"] },
  { code: "621", label: "Incorporación Fiscal", persons: ["F"] },
  { code: "622", label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", persons: ["M"] },
  { code: "623", label: "Opcional para Grupos de Sociedades", persons: ["M"] },
  { code: "624", label: "Coordinados", persons: ["M"] },
  {
    code: "625",
    label: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
    persons: ["F"],
  },
  { code: "626", label: "Régimen Simplificado de Confianza", persons: ["F", "M"] },
];

// c_UsoCFDI (se excluyen CP01 Pagos y CN01 Nómina, que no aplican a ventas de mostrador)
export const CFDI_USES: CatalogEntry[] = [
  { code: "G01", label: "Adquisición de mercancías", persons: ["F", "M"] },
  { code: "G02", label: "Devoluciones, descuentos o bonificaciones", persons: ["F", "M"] },
  { code: "G03", label: "Gastos en general", persons: ["F", "M"] },
  { code: "I01", label: "Construcciones", persons: ["F", "M"] },
  { code: "I02", label: "Mobiliario y equipo de oficina por inversiones", persons: ["F", "M"] },
  { code: "I03", label: "Equipo de transporte", persons: ["F", "M"] },
  { code: "I04", label: "Equipo de cómputo y accesorios", persons: ["F", "M"] },
  { code: "I05", label: "Dados, troqueles, moldes, matrices y herramental", persons: ["F", "M"] },
  { code: "I06", label: "Comunicaciones telefónicas", persons: ["F", "M"] },
  { code: "I07", label: "Comunicaciones satelitales", persons: ["F", "M"] },
  { code: "I08", label: "Otra maquinaria y equipo", persons: ["F", "M"] },
  { code: "D01", label: "Honorarios médicos, dentales y gastos hospitalarios", persons: ["F"] },
  { code: "D02", label: "Gastos médicos por incapacidad o discapacidad", persons: ["F"] },
  { code: "D03", label: "Gastos funerales", persons: ["F"] },
  { code: "D04", label: "Donativos", persons: ["F"] },
  { code: "D05", label: "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)", persons: ["F"] },
  { code: "D06", label: "Aportaciones voluntarias al SAR", persons: ["F"] },
  { code: "D07", label: "Primas por seguros de gastos médicos", persons: ["F"] },
  { code: "D08", label: "Gastos de transportación escolar obligatoria", persons: ["F"] },
  {
    code: "D09",
    label: "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
    persons: ["F"],
  },
  { code: "D10", label: "Pagos por servicios educativos (colegiaturas)", persons: ["F"] },
  { code: "S01", label: "Sin efectos fiscales", persons: ["F", "M"] },
];

// RFC genéricos de público en general y extranjeros: no se registran en un cliente.
export const GENERIC_RFCS = ["XAXX010101000", "XEXX010101000"];

const RFC_PATTERN = /^[A-ZÑ&]{3,4}(\d{2})(\d{2})(\d{2})[A-Z\d]{3}$/;

export function normalizeRfc(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function personTypeFromRfc(rfc: string): PersonType | null {
  if (rfc.length === 13) return "F";
  if (rfc.length === 12) return "M";
  return null;
}

// Formato y fecha (AAMMDD) válidos. No calcula el dígito verificador de la homoclave.
export function isValidRfc(rfc: string) {
  const match = RFC_PATTERN.exec(rfc);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function taxRegimeLabel(code: string) {
  const entry = TAX_REGIMES.find((regime) => regime.code === code);
  return entry ? `${entry.code} · ${entry.label}` : code;
}

export function cfdiUseLabel(code: string) {
  const entry = CFDI_USES.find((use) => use.code === code);
  return entry ? `${entry.code} · ${entry.label}` : code;
}
