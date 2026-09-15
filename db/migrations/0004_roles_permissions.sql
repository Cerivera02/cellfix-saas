-- Roles por usuario: roles del sistema (definidos en código) y roles Custom por taller.
-- Un miembro puede tener varios roles; sus permisos se suman.

CREATE TABLE custom_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description  text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_roles_id_tenant_key UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX custom_roles_tenant_name_key ON custom_roles (tenant_id, lower(name));

CREATE TRIGGER custom_roles_set_updated_at
  BEFORE UPDATE ON custom_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Los valores válidos de permission viven en src/lib/permissions.ts.
CREATE TABLE custom_role_permissions (
  role_id     uuid NOT NULL REFERENCES custom_roles (id) ON DELETE CASCADE,
  permission  text NOT NULL CHECK (permission ~ '^[a-z]+\.[a-z_]+$'),
  PRIMARY KEY (role_id, permission)
);

-- Cada fila asigna a un miembro un rol del sistema o un rol Custom (nunca ambos).
CREATE TABLE member_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  user_id         uuid NOT NULL,
  system_role     text CHECK (system_role IN ('owner', 'reception', 'inventory', 'technician', 'supervisor')),
  custom_role_id  uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_roles_one_role CHECK ((system_role IS NULL) <> (custom_role_id IS NULL)),
  FOREIGN KEY (tenant_id, user_id) REFERENCES memberships (tenant_id, user_id) ON DELETE CASCADE,
  -- La FK compuesta garantiza que el rol Custom pertenezca al mismo taller.
  FOREIGN KEY (custom_role_id, tenant_id) REFERENCES custom_roles (id, tenant_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX member_roles_system_key ON member_roles (tenant_id, user_id, system_role)
  WHERE system_role IS NOT NULL;
CREATE UNIQUE INDEX member_roles_custom_key ON member_roles (tenant_id, user_id, custom_role_id)
  WHERE custom_role_id IS NOT NULL;
CREATE INDEX member_roles_custom_role_idx ON member_roles (custom_role_id);

-- Migra los roles anteriores: owner → Propietario, admin → Supervisor, staff → Técnico.
INSERT INTO member_roles (tenant_id, user_id, system_role)
SELECT tenant_id, user_id,
       CASE role WHEN 'owner' THEN 'owner' WHEN 'admin' THEN 'supervisor' ELSE 'technician' END
  FROM memberships;

ALTER TABLE memberships DROP COLUMN role;
