-- Mano de obra por refacción: al agregarla a una orden se cobra junto con la pieza.

ALTER TABLE items
  ADD COLUMN labor_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (labor_price >= 0);

ALTER TABLE items
  ADD CONSTRAINT items_labor_price_part_check CHECK (is_repair_part OR labor_price = 0);

-- En renglones de refacción: unit_price es la pieza y labor_price la mano de obra por pieza;
-- subtotal, IVA y total ya incluyen ambas.
ALTER TABLE repair_order_lines
  ADD COLUMN labor_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (labor_price >= 0);

ALTER TABLE repair_order_lines
  ADD CONSTRAINT repair_order_lines_labor_kind_check CHECK (kind = 'part' OR labor_price = 0);
