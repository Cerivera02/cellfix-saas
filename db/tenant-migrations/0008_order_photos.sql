-- Evidencia fotográfica de las órdenes, subida desde un celular con un enlace temporal (código QR).
-- Los archivos viven en disco; aquí solo se registran.

-- Enlace temporal para subir fotos. Solo se guarda el hash del token.
-- order_id es NULL mientras la orden se está capturando en recepción.
CREATE TABLE photo_upload_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL,
  order_id    uuid REFERENCES repair_orders (id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_upload_sessions_token_key UNIQUE (token_hash)
);

CREATE TABLE order_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid REFERENCES photo_upload_sessions (id) ON DELETE SET NULL,
  order_id      uuid REFERENCES repair_orders (id) ON DELETE CASCADE,
  file_name     text NOT NULL CHECK (file_name ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_photos_order_idx ON order_photos (order_id, created_at);
CREATE INDEX order_photos_session_idx ON order_photos (session_id);
CREATE INDEX order_photos_orphan_idx ON order_photos (created_at) WHERE order_id IS NULL;
