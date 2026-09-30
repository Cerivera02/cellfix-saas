-- Refacciones por conseguir de una orden: lista de piezas (del inventario o descritas a mano) con
-- su cantidad, sin precio, porque puede cambiar al conseguirlas. Reemplaza a la refacción cotizada
-- de texto libre (repair_orders.quoted_part y quoted_part_price), que se deja en la tabla pero ya no
-- se usa. No mueven inventario ni son renglones de la orden.

CREATE TABLE repair_order_quoted_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES repair_orders ON DELETE CASCADE,
  -- Artículo del inventario; NULL si se describió a mano o si el artículo se borró.
  item_id uuid REFERENCES items ON DELETE SET NULL,
  -- Nombre del artículo al registrar la orden, o la descripción capturada.
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 150),
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repair_order_quoted_parts_order_idx ON repair_order_quoted_parts (order_id);

-- La refacción cotizada que ya existía pasa a la lista como una pieza descrita a mano.
INSERT INTO repair_order_quoted_parts (order_id, description, quantity, created_at)
SELECT id, quoted_part, 1, created_at
  FROM repair_orders
 WHERE quoted_part IS NOT NULL;
