-- Pago pendiente: fecha en que la suscripción entró en past_due. Los días de gracia cuentan
-- desde aquí (una sola vez), no desde el fin de cada periodo. Se limpia al volver a estar al corriente.
-- Desde esta migración current_period_end es siempre el fin del periodo actual de Stripe
-- (o la fecha de término si se canceló).
ALTER TABLE tenants ADD COLUMN past_due_since timestamptz;

-- Talleres que ya están en pago pendiente: la gracia empieza a contar hoy.
UPDATE tenants SET past_due_since = now() WHERE subscription_status = 'past_due';
