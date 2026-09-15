import "server-only";
import { withTenantDb } from "@/lib/tenancy/db";
import { UUID_PATTERN } from "@/lib/validation";

// Clientes del taller. Todo corre en el schema del taller. No verifica la sesión:
// la acción o página que llama ya comprobó los permisos.

export type TaxData = {
  taxId: string;
  legalName: string;
  taxRegime: string;
  taxZipCode: string;
  cfdiUse: string;
};

export type CustomerInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  billingEmail: string;
  tax: TaxData | null;
};

export type Customer = CustomerInput & { id: string; fullName: string; isActive: boolean; createdAt: Date };

export type CustomerSummary = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  taxId: string | null;
  isActive: boolean;
  salesCount: number;
  lastSaleAt: Date | null;
};

// Opción para los selectores (react-select): nombre y un detalle de contacto.
export type CustomerOption = { value: string; label: string; detail: string };

export type CustomerSale = { id: string; folio: number; createdAt: Date; total: string; refundedTotal: string };

export class CustomerError extends Error {}

function toFullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

type CustomerRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  notes: string;
  tax_id: string | null;
  legal_name: string | null;
  tax_regime: string | null;
  tax_zip_code: string | null;
  cfdi_use: string | null;
  billing_email: string | null;
  is_active: boolean;
  created_at: Date;
};

const CUSTOMER_COLUMNS = `id, first_name, last_name, phone, email, notes, tax_id, legal_name, tax_regime,
  tax_zip_code, cfdi_use, billing_email, is_active, created_at`;

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: toFullName(row.first_name, row.last_name),
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    billingEmail: row.billing_email ?? "",
    tax:
      row.tax_id && row.legal_name && row.tax_regime && row.tax_zip_code && row.cfdi_use
        ? {
            taxId: row.tax_id,
            legalName: row.legal_name,
            taxRegime: row.tax_regime,
            taxZipCode: row.tax_zip_code,
            cfdiUse: row.cfdi_use,
          }
        : null,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function toOption(customer: { id: string; fullName: string; phone: string; email: string; taxId: string | null }) {
  return {
    value: customer.id,
    label: customer.fullName,
    detail: [customer.phone, customer.email, customer.taxId].filter(Boolean).join(" · "),
  };
}

// Condición de búsqueda por nombre, teléfono, correo o RFC. El teléfono solo se compara si lo
// escrito no tiene letras ("55 1234"); así un RFC como "GODE56" no coincide con teléfonos.
function searchCondition(search: string, params: string[]) {
  const phoneDigits = /\p{L}/u.test(search) ? "" : search.replace(/\D/g, "");
  params.push(`%${escapeLike(search)}%`, phoneDigits);
  const text = `$${params.length - 1}`;
  const digits = `$${params.length}`;
  return `(c.first_name || ' ' || c.last_name ILIKE ${text} OR c.email ILIKE ${text} OR c.tax_id ILIKE ${text}
           OR (${digits} <> '' AND c.phone LIKE '%' || ${digits} || '%'))`;
}

export async function listCustomers(
  tenantId: string,
  options: { search: string; archived: boolean },
): Promise<CustomerSummary[]> {
  return withTenantDb(tenantId, async (client) => {
    const params: string[] = [];
    const conditions = [options.archived ? "NOT c.is_active" : "c.is_active"];
    if (options.search) conditions.push(searchCondition(options.search, params));

    const { rows } = await client.query<{
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
      tax_id: string | null;
      is_active: boolean;
      sales_count: number;
      last_sale_at: Date | null;
    }>(
      `SELECT c.id, c.first_name, c.last_name, c.phone, c.email, c.tax_id, c.is_active,
              (SELECT count(*)::int FROM sales s WHERE s.customer_id = c.id) AS sales_count,
              (SELECT max(s.created_at) FROM sales s WHERE s.customer_id = c.id) AS last_sale_at
         FROM customers c
        WHERE ${conditions.join(" AND ")}
        ORDER BY lower(c.first_name), lower(c.last_name)
        LIMIT 200`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      fullName: toFullName(row.first_name, row.last_name),
      phone: row.phone,
      email: row.email,
      taxId: row.tax_id,
      isActive: row.is_active,
      salesCount: row.sales_count,
      lastSaleAt: row.last_sale_at,
    }));
  });
}

// Para el selector de la caja: sin búsqueda muestra primero a quienes compraron recientemente.
export async function searchCustomerOptions(tenantId: string, query: string): Promise<CustomerOption[]> {
  const search = query.trim().slice(0, 100);

  return withTenantDb(tenantId, async (client) => {
    const params: string[] = [];
    const conditions = ["c.is_active"];
    if (search) conditions.push(searchCondition(search, params));

    const { rows } = await client.query<{
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
      tax_id: string | null;
    }>(
      `SELECT c.id, c.first_name, c.last_name, c.phone, c.email, c.tax_id
         FROM customers c
        WHERE ${conditions.join(" AND ")}
        ORDER BY (SELECT max(s.created_at) FROM sales s WHERE s.customer_id = c.id) DESC NULLS LAST,
                 lower(c.first_name), lower(c.last_name)
        LIMIT 20`,
      params,
    );

    return rows.map((row) =>
      toOption({
        id: row.id,
        fullName: toFullName(row.first_name, row.last_name),
        phone: row.phone,
        email: row.email,
        taxId: row.tax_id,
      }),
    );
  });
}

export async function getCustomer(
  tenantId: string,
  customerId: string,
): Promise<{ customer: Customer; sales: CustomerSale[] } | null> {
  if (!UUID_PATTERN.test(customerId)) return null;

  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<CustomerRow>(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1`, [customerId]);
    const row = rows[0];
    if (!row) return null;

    const { rows: saleRows } = await client.query<{
      id: string;
      folio: number;
      created_at: Date;
      total: string;
      refunded_total: string;
    }>(
      `SELECT id, folio::int AS folio, created_at, total, refunded_total
         FROM sales WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [customerId],
    );

    return {
      customer: mapCustomer(row),
      sales: saleRows.map((sale) => ({
        id: sale.id,
        folio: sale.folio,
        createdAt: sale.created_at,
        total: sale.total,
        refundedTotal: sale.refunded_total,
      })),
    };
  });
}

function customerValues(input: CustomerInput) {
  return [
    input.firstName,
    input.lastName,
    input.phone,
    input.email,
    input.notes,
    input.tax?.taxId ?? null,
    input.tax?.legalName ?? null,
    input.tax?.taxRegime ?? null,
    input.tax?.taxZipCode ?? null,
    input.tax?.cfdiUse ?? null,
    input.billingEmail || null,
  ];
}

export async function createCustomer(tenantId: string, input: CustomerInput): Promise<CustomerOption> {
  return withTenantDb(tenantId, async (client) => {
    const { rows } = await client.query<CustomerRow>(
      `INSERT INTO customers (first_name, last_name, phone, email, notes, tax_id, legal_name, tax_regime,
                              tax_zip_code, cfdi_use, billing_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${CUSTOMER_COLUMNS}`,
      customerValues(input),
    );
    const customer = mapCustomer(rows[0]);
    return toOption({ ...customer, taxId: customer.tax?.taxId ?? null });
  });
}

export async function updateCustomer(tenantId: string, customerId: string, input: CustomerInput) {
  if (!UUID_PATTERN.test(customerId)) throw new CustomerError("Solicitud no válida.");

  await withTenantDb(tenantId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE customers
          SET first_name = $1, last_name = $2, phone = $3, email = $4, notes = $5, tax_id = $6, legal_name = $7,
              tax_regime = $8, tax_zip_code = $9, cfdi_use = $10, billing_email = $11
        WHERE id = $12`,
      [...customerValues(input), customerId],
    );
    if (!rowCount) throw new CustomerError("El cliente ya no existe.");
  });
}

// Los clientes se archivan en lugar de borrarse para conservar su historial de compras.
export async function setCustomerActive(tenantId: string, customerId: string, active: boolean) {
  if (!UUID_PATTERN.test(customerId)) throw new CustomerError("Solicitud no válida.");
  await withTenantDb(tenantId, (client) =>
    client.query("UPDATE customers SET is_active = $1 WHERE id = $2", [active, customerId]),
  );
}
