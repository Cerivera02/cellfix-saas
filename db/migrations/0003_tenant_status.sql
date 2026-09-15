-- Estado del taller: los usuarios de un taller suspendido no pueden iniciar sesión.

ALTER TABLE tenants
  ADD COLUMN status text NOT NULL DEFAULT 'active'
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended'));
