-- Seguimiento público de órdenes para el cliente y datos del negocio para los tickets.

-- Token del enlace público de seguimiento (64 caracteres hexadecimales). Las órdenes existentes
-- reciben uno al agregar la columna y las nuevas lo toman del valor por omisión.
ALTER TABLE repair_orders
  ADD COLUMN tracking_token text NOT NULL
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    CHECK (tracking_token ~ '^[0-9a-f]{64}$');

ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_tracking_token_key UNIQUE (tracking_token);

-- Configuración de los tickets impresos: un solo renglón por taller.
-- Sin nombre comercial se imprime el nombre del taller.
CREATE TABLE ticket_settings (
  id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
  business_name        text CHECK (length(business_name) BETWEEN 1 AND 80),
  address              text NOT NULL DEFAULT '' CHECK (length(address) <= 200),
  phone                text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  tax_id               text NOT NULL DEFAULT '' CHECK (length(tax_id) <= 13),  -- RFC
  -- Condiciones de servicio impresas en el comprobante de recepción.
  order_terms          text NOT NULL DEFAULT '' CHECK (length(order_terms) <= 1500),
  order_footer         text NOT NULL DEFAULT '' CHECK (length(order_footer) <= 200),
  sale_footer          text NOT NULL DEFAULT '' CHECK (length(sale_footer) <= 200),
  show_tracking_qr     boolean NOT NULL DEFAULT true,
  paper_width          text NOT NULL DEFAULT '80' CHECK (paper_width IN ('58', '80')),
  show_customer_phone  boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER ticket_settings_set_updated_at
  BEFORE UPDATE ON ticket_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO ticket_settings DEFAULT VALUES;
