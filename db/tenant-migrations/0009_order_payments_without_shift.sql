-- Cobros de órdenes sin turno de caja: cuando el taller no tiene activo el módulo de Caja,
-- los anticipos, pagos y reembolsos se registran sin turno (shift_id NULL).

ALTER TABLE repair_order_payments
  ALTER COLUMN shift_id DROP NOT NULL;
