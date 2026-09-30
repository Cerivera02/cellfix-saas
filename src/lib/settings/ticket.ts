// Configuración de los tickets impresos (sin dependencias de servidor: la usa también la vista previa).

export const PAPER_WIDTHS = ["58", "80"] as const;

export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export const PAPER_WIDTH_LABELS: Record<PaperWidth, string> = {
  "58": "58 mm",
  "80": "80 mm",
};

export function isPaperWidth(value: string): value is PaperWidth {
  return (PAPER_WIDTHS as readonly string[]).includes(value);
}

// Mismos límites que las columnas de ticket_settings.
export const TICKET_LIMITS = {
  businessName: 80,
  address: 200,
  phone: 40,
  taxId: 13,
  orderTerms: 1500,
  orderFooter: 200,
  saleFooter: 200,
} as const;

export const DEFAULT_ORDER_FOOTER = "¡Gracias por su preferencia!";
export const DEFAULT_SALE_FOOTER = "¡Gracias por su compra!";

// Datos del negocio del encabezado de los tickets.
export type TicketBusiness = { name: string; address: string; phone: string; taxId: string };

export type TicketSettings = {
  // Nombre comercial capturado; vacío si se usa el nombre del taller.
  customBusinessName: string;
  business: TicketBusiness;
  orderTerms: string;
  orderFooter: string;
  saleFooter: string;
  showTrackingQr: boolean;
  paperWidth: PaperWidth;
  showCustomerPhone: boolean;
};
