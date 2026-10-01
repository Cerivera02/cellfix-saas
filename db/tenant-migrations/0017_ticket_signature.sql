-- Línea de firma del cliente en el comprobante de recepción: opcional, apagada por omisión
-- (solo la usan los talleres que piden firma al recibir el equipo).

ALTER TABLE ticket_settings
  ADD COLUMN show_signature boolean NOT NULL DEFAULT false;
