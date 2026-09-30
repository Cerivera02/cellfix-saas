-- Refacción cotizada al recibir un equipo cuya pieza hay que conseguir.
-- La pieza aún no está en existencia, así que no se agrega como renglón de la orden (se duplicaría
-- al llegar); se guarda como cotización para imprimirla en el comprobante y mostrarla al cliente.
-- Las refacciones en existencia se agregan como renglones desde la recepción.

ALTER TABLE repair_orders
  ADD COLUMN quoted_part text CHECK (length(quoted_part) BETWEEN 1 AND 150),
  -- Precio cotizado de la refacción, con IVA (NULL si no se cotizó precio).
  ADD COLUMN quoted_part_price numeric(12, 2) CHECK (quoted_part_price >= 0);
