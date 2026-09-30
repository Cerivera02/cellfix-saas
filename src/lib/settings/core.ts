import "server-only";
import type { PoolClient } from "pg";
import { withTenantDb } from "@/lib/tenancy/db";
import { isPaperWidth, type PaperWidth, type TicketSettings } from "@/lib/settings/ticket";

// Configuración del taller guardada en su schema: datos de los tickets y reglas de las órdenes.

// Órdenes: costo sugerido del diagnóstico, si se descuenta del total al hacerse la reparación y si
// se envían correos al cliente (enlace de seguimiento al recibir y aviso de equipo listo).
export type RepairSettings = { diagnosisFee: string; diagnosisCredit: boolean; notifyCustomers: boolean };

// Lee la configuración de órdenes dentro de una transacción ya abierta en el schema del taller.
// Sin renglón guardado se usan los valores por omisión.
export async function readRepairSettings(client: PoolClient): Promise<RepairSettings> {
  const { rows } = await client.query<{ diagnosis_fee: string; diagnosis_credit: boolean; notify_customers: boolean }>(
    "SELECT diagnosis_fee, diagnosis_credit, notify_customers FROM repair_settings",
  );
  return {
    diagnosisFee: rows[0]?.diagnosis_fee ?? "0.00",
    diagnosisCredit: rows[0]?.diagnosis_credit ?? true,
    notifyCustomers: rows[0]?.notify_customers ?? true,
  };
}

export async function getRepairSettings(tenantId: string) {
  return withTenantDb(tenantId, readRepairSettings);
}

// `afterSave` corre en la misma transacción (por ejemplo, para ajustar las órdenes abiertas).
export async function updateRepairSettings(
  tenantId: string,
  input: RepairSettings,
  afterSave?: (client: PoolClient) => Promise<void>,
) {
  await withTenantDb(tenantId, async (client) => {
    await client.query(
      `INSERT INTO repair_settings (id, diagnosis_fee, diagnosis_credit, notify_customers)
       VALUES (true, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         diagnosis_fee = EXCLUDED.diagnosis_fee, diagnosis_credit = EXCLUDED.diagnosis_credit,
         notify_customers = EXCLUDED.notify_customers`,
      [input.diagnosisFee, input.diagnosisCredit, input.notifyCustomers],
    );
    await afterSave?.(client);
  });
}

type TicketSettingsRow = {
  tenant_name: string | null;
  business_name: string | null;
  address: string | null;
  phone: string | null;
  tax_id: string | null;
  order_terms: string | null;
  order_footer: string | null;
  sale_footer: string | null;
  show_tracking_qr: boolean | null;
  paper_width: string | null;
  show_customer_phone: boolean | null;
};

export type TicketSettingsInput = {
  businessName: string;
  address: string;
  phone: string;
  taxId: string;
  orderTerms: string;
  orderFooter: string;
  saleFooter: string;
  showTrackingQr: boolean;
  paperWidth: PaperWidth;
  showCustomerPhone: boolean;
};

// Sin renglón guardado (o sin nombre comercial) se usan los valores por omisión y el nombre del taller.
export async function getTicketSettings(tenantId: string): Promise<TicketSettings> {
  const row = await withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<TicketSettingsRow>(
      `SELECT t.name AS tenant_name, s.business_name, s.address, s.phone, s.tax_id, s.order_terms,
              s.order_footer, s.sale_footer, s.show_tracking_qr, s.paper_width, s.show_customer_phone
         FROM public.tenants t
         LEFT JOIN ticket_settings s ON true
        WHERE t.id = $1`,
      [tenantId],
    );
    return rows[0];
  });

  const customBusinessName = row?.business_name ?? "";
  return {
    customBusinessName,
    business: {
      name: customBusinessName || row?.tenant_name || "",
      address: row?.address ?? "",
      phone: row?.phone ?? "",
      taxId: row?.tax_id ?? "",
    },
    orderTerms: row?.order_terms ?? "",
    orderFooter: row?.order_footer ?? "",
    saleFooter: row?.sale_footer ?? "",
    showTrackingQr: row?.show_tracking_qr ?? true,
    paperWidth: row?.paper_width && isPaperWidth(row.paper_width) ? row.paper_width : "80",
    showCustomerPhone: row?.show_customer_phone ?? true,
  };
}

export async function updateTicketSettings(tenantId: string, input: TicketSettingsInput) {
  await withTenantDb(tenantId, async (client) => {
    await client.query(
      `INSERT INTO ticket_settings (id, business_name, address, phone, tax_id, order_terms, order_footer, sale_footer,
                                    show_tracking_qr, paper_width, show_customer_phone)
       VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         business_name = EXCLUDED.business_name, address = EXCLUDED.address, phone = EXCLUDED.phone,
         tax_id = EXCLUDED.tax_id, order_terms = EXCLUDED.order_terms, order_footer = EXCLUDED.order_footer,
         sale_footer = EXCLUDED.sale_footer, show_tracking_qr = EXCLUDED.show_tracking_qr,
         paper_width = EXCLUDED.paper_width, show_customer_phone = EXCLUDED.show_customer_phone`,
      [
        input.businessName || null,
        input.address,
        input.phone,
        input.taxId,
        input.orderTerms,
        input.orderFooter,
        input.saleFooter,
        input.showTrackingQr,
        input.paperWidth,
        input.showCustomerPhone,
      ],
    );
  });
}
