-- Suscripciones: prueba gratuita, días de gracia, precios por módulo y datos de Stripe.
-- Los talleres existentes (dados de alta por el administrador) quedan como suscripción activa.

ALTER TABLE tenants
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'active'
    CONSTRAINT tenants_subscription_status_check
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  -- Fin de la prueba gratuita; NULL si el taller no pasó por prueba.
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN stripe_customer_id text UNIQUE,
  ADD COLUMN stripe_subscription_id text UNIQUE,
  -- Pagado hasta, según Stripe: fin del periodo actual si está al corriente, inicio del periodo
  -- impago si hay pago pendiente y fecha de término si se canceló.
  ADD COLUMN current_period_end timestamptz;

-- Configuración de la plataforma: un solo renglón.
CREATE TABLE platform_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  trial_days  integer NOT NULL DEFAULT 30 CHECK (trial_days BETWEEN 1 AND 365),
  grace_days  integer NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 90),
  currency    text NOT NULL DEFAULT 'mxn' CHECK (currency ~ '^[a-z]{3}$'),
  -- Precio mensual de la base (reparaciones, clientes y equipo).
  base_price  numeric(12, 2) NOT NULL DEFAULT 299 CHECK (base_price >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_settings_set_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO platform_settings DEFAULT VALUES;

-- Precio mensual de cada módulo opcional (mismas claves que src/lib/modules.ts).
CREATE TABLE module_prices (
  module      text PRIMARY KEY CHECK (module IN ('cash', 'inventory', 'purchases', 'photos', 'tracking')),
  price       numeric(12, 2) NOT NULL CHECK (price >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER module_prices_set_updated_at
  BEFORE UPDATE ON module_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO module_prices (module, price) VALUES
  ('cash', 149), ('inventory', 149), ('purchases', 99), ('photos', 99), ('tracking', 99);
