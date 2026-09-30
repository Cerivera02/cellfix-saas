-- Módulos contratados por cada taller. Reparaciones, clientes y equipo siempre están activos;
-- estos son los opcionales. Los talleres existentes conservan todos.

ALTER TABLE tenants
  ADD COLUMN modules text[] NOT NULL DEFAULT ARRAY['cash', 'inventory', 'purchases', 'photos', 'tracking']
  CONSTRAINT tenants_modules_check
    CHECK (modules <@ ARRAY['cash', 'inventory', 'purchases', 'photos', 'tracking']),
  -- Compras mueve existencias: no puede estar activo sin Inventario.
  ADD CONSTRAINT tenants_modules_purchases_check
    CHECK (NOT ('purchases' = ANY (modules)) OR 'inventory' = ANY (modules));
