-- Correos al cliente: el enlace de seguimiento al recibir el equipo y el aviso cuando la orden
-- queda lista para entregar. El propietario puede apagarlos desde la configuración de órdenes.

ALTER TABLE repair_settings
  ADD COLUMN notify_customers boolean NOT NULL DEFAULT true;

-- Cada correo se envía una sola vez por orden: si la orden vuelve de "Listo" a reparación y
-- regresa a "Listo", no se repite el aviso. NULL mientras no se haya enviado.
ALTER TABLE repair_orders
  ADD COLUMN intake_email_sent_at timestamptz,
  ADD COLUMN ready_email_sent_at timestamptz;
