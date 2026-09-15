-- Administradores de la plataforma: entran a /admin y no pertenecen a ningún taller.

ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

-- Las sesiones del panel administrativo no tienen taller.
ALTER TABLE sessions ALTER COLUMN tenant_id DROP NOT NULL;

-- Con tenant_id nulo la FK compuesta a memberships no se evalúa,
-- así que se agrega la FK directa a users.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
