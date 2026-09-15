-- Inventario del taller: categorías, proveedores, artículos y movimientos de existencias.
-- Corre dentro del schema de cada taller, por eso las tablas no llevan tenant_id.

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_name_key ON categories (lower(name));

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  contact_name  text NOT NULL DEFAULT '' CHECK (length(contact_name) <= 120),
  phone         varchar(30) NOT NULL DEFAULT '',
  email         varchar(200) NOT NULL DEFAULT '',
  tax_id        varchar(20) NOT NULL DEFAULT '',
  address       text NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  notes         text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN suppliers.tax_id IS 'RFC u otra identificación fiscal';

CREATE UNIQUE INDEX suppliers_name_key ON suppliers (lower(name));

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Los importes usan numeric(12,2): exactos a 2 decimales (los flotantes redondean mal).
-- stock solo cambia a través de stock_movements, dentro de la misma transacción.
CREATE TABLE items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  description     text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  barcode         varchar(64),
  is_for_sale     boolean NOT NULL DEFAULT true,
  is_repair_part  boolean NOT NULL DEFAULT false,
  category_id     uuid REFERENCES categories (id) ON DELETE SET NULL,
  supplier_id     uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  purchase_price  numeric(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sale_price      numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  stock           integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock       integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_kind_check CHECK (is_for_sale OR is_repair_part),
  CONSTRAINT items_barcode_not_blank CHECK (barcode IS NULL OR length(btrim(barcode)) > 0)
);

CREATE UNIQUE INDEX items_barcode_key ON items (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX items_name_idx ON items (lower(name));
CREATE INDEX items_category_idx ON items (category_id);
CREATE INDEX items_supplier_idx ON items (supplier_id);

CREATE TRIGGER items_set_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Historial de existencias. quantity es positiva en entradas y negativa en salidas.
-- user_name guarda el nombre al momento del movimiento aunque el usuario se elimine después.
CREATE TABLE stock_movements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('initial', 'purchase', 'adjustment', 'sale', 'repair', 'return')),
  quantity     integer NOT NULL CHECK (quantity <> 0),
  stock_after  integer NOT NULL CHECK (stock_after >= 0),
  unit_cost    numeric(12, 2) CHECK (unit_cost >= 0),
  supplier_id  uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  note         text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  user_id      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name    text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_movements_item_idx ON stock_movements (item_id, created_at DESC);
