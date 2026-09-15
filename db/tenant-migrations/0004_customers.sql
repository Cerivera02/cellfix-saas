-- Clientes del taller, con datos opcionales para facturar (CFDI 4.0), y cliente obligatorio en ventas.

CREATE TABLE customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     text NOT NULL CHECK (length(first_name) BETWEEN 1 AND 80),
  last_name      text NOT NULL DEFAULT '' CHECK (length(last_name) <= 120),
  phone          varchar(16) NOT NULL DEFAULT '' CHECK (phone = '' OR phone ~ '^\+?[0-9]{7,15}$'),
  email          varchar(200) NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),

  -- Receptor del CFDI 4.0: todos o ninguno.
  tax_id         varchar(13),  -- RFC
  legal_name     text,         -- Nombre o razón social como aparece en la Constancia de Situación Fiscal
  tax_regime     varchar(3),   -- Catálogo c_RegimenFiscal
  tax_zip_code   varchar(5),   -- Código postal del domicilio fiscal
  cfdi_use       varchar(4),   -- Catálogo c_UsoCFDI (predeterminado para sus facturas)
  billing_email  varchar(200),

  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Para garantías hace falta una forma de contacto.
  CONSTRAINT customers_contact_check CHECK (phone <> '' OR email <> ''),
  CONSTRAINT customers_tax_complete CHECK (
    (tax_id IS NULL AND legal_name IS NULL AND tax_regime IS NULL AND tax_zip_code IS NULL AND cfdi_use IS NULL)
    OR (tax_id IS NOT NULL AND legal_name IS NOT NULL AND tax_regime IS NOT NULL
        AND tax_zip_code IS NOT NULL AND cfdi_use IS NOT NULL)
  ),
  CONSTRAINT customers_tax_id_format CHECK (tax_id IS NULL OR tax_id ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  CONSTRAINT customers_tax_regime_format CHECK (tax_regime IS NULL OR tax_regime ~ '^[0-9]{3}$'),
  CONSTRAINT customers_tax_zip_format CHECK (tax_zip_code IS NULL OR tax_zip_code ~ '^[0-9]{5}$'),
  CONSTRAINT customers_cfdi_use_format CHECK (cfdi_use IS NULL OR cfdi_use ~ '^[A-Z]{1,2}[0-9]{2}$')
);

CREATE INDEX customers_name_idx ON customers (lower(first_name), lower(last_name));
CREATE INDEX customers_phone_idx ON customers (phone);
CREATE INDEX customers_tax_id_idx ON customers (tax_id) WHERE tax_id IS NOT NULL;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cliente de cada venta. Las ventas anteriores quedan sin cliente (NOT VALID no las revisa);
-- toda venta nueva debe tenerlo.
ALTER TABLE sales ADD COLUMN customer_id uuid REFERENCES customers (id);
ALTER TABLE sales ADD CONSTRAINT sales_customer_required CHECK (customer_id IS NOT NULL) NOT VALID;
CREATE INDEX sales_customer_idx ON sales (customer_id);
