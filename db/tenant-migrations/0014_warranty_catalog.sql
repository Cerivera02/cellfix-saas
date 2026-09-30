-- Catálogo de garantías configurable por el propietario. La garantía ya no se captura al recibir
-- el equipo: se elige del catálogo al entregarlo (solo si quedó reparado) y la orden guarda una
-- copia del nombre y los días, para que cambiar o archivar el catálogo no altere lo ya entregado.

CREATE TABLE warranties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  days        integer NOT NULL CHECK (days BETWEEN 0 AND 3650),
  -- Las archivadas ya no se ofrecen al entregar.
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX warranties_name_key ON warranties (lower(name));

CREATE TRIGGER warranties_set_updated_at
  BEFORE UPDATE ON warranties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO warranties (name, days) VALUES
  ('Sin garantía', 0),
  ('30 días', 30),
  ('90 días', 90);

-- Nombre de la garantía elegida al entregar; NULL en órdenes sin entregar, sin reparación o
-- entregadas antes del catálogo (esas conservan sus días de garantía).
ALTER TABLE repair_orders
  ADD COLUMN warranty_name text CHECK (length(warranty_name) BETWEEN 1 AND 60);

-- Los días se fijan al entregar: las órdenes nuevas empiezan en 0 y el límite sube al del catálogo.
ALTER TABLE repair_orders ALTER COLUMN warranty_days SET DEFAULT 0;
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_warranty_days_check;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_warranty_days_check CHECK (warranty_days BETWEEN 0 AND 3650);
