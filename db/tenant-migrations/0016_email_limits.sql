-- Límites de los correos al cliente, para que no se puedan usar para enviar correos sin control:
-- una espera mínima entre reenvíos manuales del enlace y un tope diario por taller.

-- Último reenvío manual del enlace de seguimiento; NULL si nunca se ha reenviado.
ALTER TABLE repair_orders
  ADD COLUMN last_resent_at timestamptz;

-- Registro de los correos enviados al cliente (automáticos y reenvíos); cuenta para el tope diario.
CREATE TABLE email_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES repair_orders (id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('received', 'ready', 'resent')),
  recipient   varchar(200) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_log_created_idx ON email_log (created_at);
