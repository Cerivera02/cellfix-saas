-- Cada taller guarda sus datos de negocio (inventario, órdenes, caja...) en su propio schema.
-- Talleres, usuarios, sesiones y roles siguen en este esquema compartido.
-- Los schemas se crean y migran con db/tenant-migrations (npm run db:migrate y alta de taller).

ALTER TABLE tenants
  ADD COLUMN schema_name text GENERATED ALWAYS AS ('t_' || replace(id::text, '-', '')) STORED;

ALTER TABLE tenants ADD CONSTRAINT tenants_schema_name_key UNIQUE (schema_name);
