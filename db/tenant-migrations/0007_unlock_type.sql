-- Tipo de desbloqueo del equipo: sin bloqueo, PIN, contraseña o patrón (secuencia de puntos 1-9).

ALTER TABLE repair_orders
  ADD COLUMN unlock_type text NOT NULL DEFAULT 'none' CHECK (unlock_type IN ('none', 'pin', 'password', 'pattern'));

-- Lo capturado antes era texto libre: queda como contraseña. Sin tocar updated_at.
ALTER TABLE repair_orders DISABLE TRIGGER repair_orders_set_updated_at;
UPDATE repair_orders SET unlock_type = 'password' WHERE unlock_code <> '';
ALTER TABLE repair_orders ENABLE TRIGGER repair_orders_set_updated_at;

ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_unlock_format_check CHECK (
  (unlock_type = 'none' AND unlock_code = '')
  OR (unlock_type = 'pin' AND unlock_code ~ '^[0-9]{4,16}$')
  OR (unlock_type = 'password' AND length(unlock_code) BETWEEN 1 AND 60)
  OR (unlock_type = 'pattern' AND unlock_code ~ '^[1-9](-[1-9]){3,8}$')
);
