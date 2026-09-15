-- Órdenes de reparación (refacciones, mano de obra, anticipos y entrega) y compras a
-- proveedores (contado o crédito con abonos).

-- Refacciones que regresan al inventario al quitarse de una orden o cancelarla.
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('initial', 'purchase', 'adjustment', 'sale', 'repair', 'repair_return', 'return'));

-- ---------------------------------------------------------------------------
-- Órdenes de reparación
-- ---------------------------------------------------------------------------

CREATE TABLE repair_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             bigint GENERATED ALWAYS AS IDENTITY,
  customer_id       uuid NOT NULL REFERENCES customers (id),
  status            text NOT NULL DEFAULT 'received' CHECK (status IN (
                      'received', 'diagnosing', 'awaiting_approval', 'waiting_parts', 'in_repair',
                      'ready', 'delivered', 'cancelled')),
  -- Resultado al marcarla lista: se reparó o se entrega sin reparación.
  outcome           text CHECK (outcome IN ('repaired', 'not_repaired')),
  device_type       text NOT NULL CHECK (length(device_type) BETWEEN 1 AND 40),
  brand             text NOT NULL DEFAULT '' CHECK (length(brand) <= 60),
  model             text NOT NULL DEFAULT '' CHECK (length(model) <= 80),
  serial_number     varchar(40) NOT NULL DEFAULT '',  -- IMEI o número de serie
  color             text NOT NULL DEFAULT '' CHECK (length(color) <= 40),
  unlock_code       text NOT NULL DEFAULT '' CHECK (length(unlock_code) <= 60),  -- PIN, contraseña o patrón
  accessories       text NOT NULL DEFAULT '' CHECK (length(accessories) <= 300),
  device_condition  text NOT NULL DEFAULT '' CHECK (length(device_condition) <= 500),
  reported_issue    text NOT NULL CHECK (length(reported_issue) BETWEEN 1 AND 1000),
  diagnosis         text NOT NULL DEFAULT '' CHECK (length(diagnosis) <= 2000),
  estimated_cost    numeric(12, 2) CHECK (estimated_cost >= 0),
  promised_on       date,
  warranty_days     integer NOT NULL DEFAULT 30 CHECK (warranty_days BETWEEN 0 AND 365),
  technician_id     uuid REFERENCES public.users (id) ON DELETE SET NULL,
  technician_name   text NOT NULL DEFAULT '',
  -- Anticipos y pagos menos reembolsos. El total sale de repair_order_lines.
  paid_total        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  cancel_reason     text NOT NULL DEFAULT '' CHECK (length(cancel_reason) <= 300),
  created_by        uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_by_name   text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  delivered_at      timestamptz,
  CONSTRAINT repair_orders_folio_key UNIQUE (folio),
  CONSTRAINT repair_orders_delivered_check CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CONSTRAINT repair_orders_outcome_status_check CHECK ((status IN ('ready', 'delivered')) = (outcome IS NOT NULL)),
  CONSTRAINT repair_orders_cancelled_paid_check CHECK (status <> 'cancelled' OR paid_total = 0)
);

CREATE INDEX repair_orders_active_idx ON repair_orders (created_at)
  WHERE status NOT IN ('delivered', 'cancelled');
CREATE INDEX repair_orders_customer_idx ON repair_orders (customer_id, created_at DESC);
CREATE INDEX repair_orders_technician_idx ON repair_orders (technician_id);
CREATE INDEX repair_orders_serial_idx ON repair_orders (serial_number) WHERE serial_number <> '';

CREATE TRIGGER repair_orders_set_updated_at
  BEFORE UPDATE ON repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Refacciones (del inventario) y mano de obra, con copia del precio e IVA al agregarse.
CREATE TABLE repair_order_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES repair_orders (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('part', 'labor')),
  item_id       uuid REFERENCES items (id) ON DELETE SET NULL,
  description   text NOT NULL CHECK (length(description) BETWEEN 1 AND 150),
  -- Si se descontó del inventario al agregarse.
  track_stock   boolean NOT NULL DEFAULT false,
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  tax_rate      numeric(5, 2) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_included  boolean NOT NULL,
  subtotal      numeric(12, 2) NOT NULL,
  tax_amount    numeric(12, 2) NOT NULL,
  total         numeric(12, 2) NOT NULL,
  user_id       uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name     text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repair_order_lines_totals_check CHECK (total = subtotal + tax_amount),
  CONSTRAINT repair_order_lines_labor_check CHECK (kind = 'part' OR (item_id IS NULL AND NOT track_stock))
);

CREATE INDEX repair_order_lines_order_idx ON repair_order_lines (order_id);

-- Anticipos, pagos al entregar y reembolsos. Siempre en el turno de caja abierto.
CREATE TABLE repair_order_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES repair_orders (id) ON DELETE CASCADE,
  shift_id         uuid NOT NULL REFERENCES cash_shifts (id),
  kind             text NOT NULL CHECK (kind IN ('deposit', 'payment', 'refund')),
  method           text NOT NULL CHECK (method IN ('cash', 'debit_card', 'credit_card', 'transfer')),
  amount           numeric(12, 2) NOT NULL CHECK (amount > 0),
  bank_account_id  uuid REFERENCES bank_accounts (id),
  reference        text NOT NULL DEFAULT '' CHECK (length(reference) <= 60),
  cash_received    numeric(12, 2) CHECK (cash_received >= 0),
  change_amount    numeric(12, 2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  user_id          uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name        text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repair_order_payments_account_check CHECK (bank_account_id IS NULL OR method = 'transfer'),
  CONSTRAINT repair_order_payments_transfer_check CHECK (kind = 'refund' OR method <> 'transfer' OR bank_account_id IS NOT NULL),
  CONSTRAINT repair_order_payments_cash_check CHECK (cash_received IS NULL OR (method = 'cash' AND kind <> 'refund'))
);

CREATE INDEX repair_order_payments_order_idx ON repair_order_payments (order_id);
CREATE INDEX repair_order_payments_shift_idx ON repair_order_payments (shift_id);

-- Historial de la orden: cambios de estado, asignaciones, entrega y cancelación.
CREATE TABLE repair_order_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES repair_orders (id) ON DELETE CASCADE,
  status      text CHECK (status IN (
                'received', 'diagnosing', 'awaiting_approval', 'waiting_parts', 'in_repair',
                'ready', 'delivered', 'cancelled')),
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  user_id     uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name   text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repair_order_events_order_idx ON repair_order_events (order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Compras a proveedores
-- ---------------------------------------------------------------------------

-- De contado se paga completa al registrarla; a crédito queda un saldo que se abona.
CREATE TABLE purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           bigint GENERATED ALWAYS AS IDENTITY,
  supplier_id     uuid NOT NULL REFERENCES suppliers (id),
  invoice_number  text NOT NULL DEFAULT '' CHECK (length(invoice_number) <= 60),
  purchased_on    date NOT NULL DEFAULT current_date,
  terms           text NOT NULL CHECK (terms IN ('cash', 'credit')),
  due_on          date,
  total           numeric(12, 2) NOT NULL CHECK (total > 0),
  paid_total      numeric(12, 2) NOT NULL DEFAULT 0,
  notes           text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  user_id         uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name       text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_folio_key UNIQUE (folio),
  CONSTRAINT purchases_paid_check CHECK (paid_total BETWEEN 0 AND total),
  CONSTRAINT purchases_cash_paid_check CHECK (terms = 'credit' OR paid_total = total),
  CONSTRAINT purchases_due_check CHECK (due_on IS NULL OR terms = 'credit')
);

CREATE INDEX purchases_created_idx ON purchases (created_at DESC);
CREATE INDEX purchases_supplier_idx ON purchases (supplier_id);
CREATE INDEX purchases_payable_idx ON purchases (due_on) WHERE paid_total < total;

-- Renglones con el costo por pieza. Opcionalmente ligados a la orden para la que se pidió la pieza.
CREATE TABLE purchase_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      uuid NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
  item_id          uuid REFERENCES items (id) ON DELETE SET NULL,
  item_name        text NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_cost        numeric(12, 2) NOT NULL CHECK (unit_cost >= 0),
  total            numeric(12, 2) NOT NULL CHECK (total >= 0),
  repair_order_id  uuid REFERENCES repair_orders (id) ON DELETE SET NULL
);

CREATE INDEX purchase_items_purchase_idx ON purchase_items (purchase_id);
CREATE INDEX purchase_items_order_idx ON purchase_items (repair_order_id) WHERE repair_order_id IS NOT NULL;

-- Pagos y abonos al proveedor. shift_id indica que el efectivo salió de la caja abierta.
CREATE TABLE purchase_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      uuid NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
  method           text NOT NULL CHECK (method IN ('cash', 'debit_card', 'credit_card', 'transfer')),
  amount           numeric(12, 2) NOT NULL CHECK (amount > 0),
  shift_id         uuid REFERENCES cash_shifts (id),
  bank_account_id  uuid REFERENCES bank_accounts (id),  -- cuenta de origen (opcional)
  reference        text NOT NULL DEFAULT '' CHECK (length(reference) <= 60),
  user_id          uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name        text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_payments_drawer_check CHECK (shift_id IS NULL OR method = 'cash'),
  CONSTRAINT purchase_payments_account_check CHECK (bank_account_id IS NULL OR method = 'transfer')
);

CREATE INDEX purchase_payments_purchase_idx ON purchase_payments (purchase_id);
CREATE INDEX purchase_payments_shift_idx ON purchase_payments (shift_id) WHERE shift_id IS NOT NULL;
