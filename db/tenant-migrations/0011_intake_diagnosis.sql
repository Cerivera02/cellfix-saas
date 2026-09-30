-- Tipo de ingreso de las órdenes y cobro del diagnóstico.
-- Al recibir el equipo se indica si la refacción está en existencia (anticipo obligatorio),
-- si hay que conseguirla (anticipo sugerido) o si el equipo pasa a diagnóstico, que se cobra
-- al recibirlo. Según la configuración del taller, el diagnóstico se descuenta del total si
-- se hace la reparación.

-- NULL en las órdenes registradas antes de este cambio.
ALTER TABLE repair_orders
  ADD COLUMN intake_type text CHECK (intake_type IN ('in_stock', 'order_part', 'diagnosis')),
  -- Costo del diagnóstico cobrado al recibir el equipo (NULL si no se cobró).
  ADD COLUMN diagnosis_fee numeric(12, 2) CHECK (diagnosis_fee > 0);

-- Renglón del diagnóstico: mano de obra sin artículo, a lo más uno por orden. Se quita cuando
-- el diagnóstico se descuenta de la reparación y vuelve si la orden se queda sin reparación.
ALTER TABLE repair_order_lines
  ADD COLUMN is_diagnosis boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT repair_order_lines_diagnosis_check CHECK (NOT is_diagnosis OR (kind = 'labor' AND item_id IS NULL));

CREATE UNIQUE INDEX repair_order_lines_diagnosis_key ON repair_order_lines (order_id) WHERE is_diagnosis;

-- Configuración de las órdenes: un solo renglón por taller.
CREATE TABLE repair_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Costo sugerido al recibir un equipo a diagnóstico (0 = diagnóstico gratis).
  diagnosis_fee     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (diagnosis_fee >= 0),
  -- Si el diagnóstico se descuenta del total cuando se hace la reparación.
  diagnosis_credit  boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER repair_settings_set_updated_at
  BEFORE UPDATE ON repair_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO repair_settings DEFAULT VALUES;
