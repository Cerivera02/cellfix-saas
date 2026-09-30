-- Historial de pagos de la suscripción: una fila por factura de Stripe, para verificar cada cobro
-- con sus ids. Se llena desde el webhook (invoice.*), al volver del checkout y con "Sincronizar pagos".
-- Las facturas en borrador y las de $0 (inicio de una prueba en Stripe) no se guardan.

CREATE TABLE subscription_payments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  stripe_invoice_id         text NOT NULL UNIQUE,
  stripe_subscription_id    text,
  stripe_payment_intent_id  text,
  stripe_charge_id          text,
  -- Folio de la factura en Stripe (p. ej. "A1B2C3D4-0001").
  number                    text,
  -- Estado de la factura en Stripe (open, paid, uncollectible, void) más uno derivado:
  -- 'failed' = sigue abierta, ya se intentó cobrar y el último intento falló.
  status                    text NOT NULL
    CONSTRAINT subscription_payments_status_check
    CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void', 'failed')),
  -- Importes en centavos.
  amount_due                integer,
  amount_paid               integer,
  currency                  text,
  period_start              timestamptz,
  period_end                timestamptz,
  paid_at                   timestamptz,
  hosted_invoice_url        text,
  invoice_pdf               text,
  receipt_url               text,
  failure_message           text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscription_payments_tenant_created_idx ON subscription_payments (tenant_id, created_at DESC);

CREATE TRIGGER subscription_payments_set_updated_at
  BEFORE UPDATE ON subscription_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
