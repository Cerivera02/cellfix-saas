-- Caja: IVA por artículo, cuentas bancarias, turnos de caja, ventas, pagos y devoluciones.
-- Los importes van en numeric(12,2); la app los calcula en centavos enteros.

-- IVA por artículo: el precio de venta puede incluirlo o sumarse al cobrar.
-- Los artículos existentes quedan con 16% incluido: su precio al cobrar no cambia.
ALTER TABLE items
  ADD COLUMN tax_rate numeric(5, 2) NOT NULL DEFAULT 16 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  ADD COLUMN tax_included boolean NOT NULL DEFAULT true;

-- Cuentas donde el taller recibe transferencias. Se archivan en lugar de borrarse.
CREATE TABLE bank_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name    text NOT NULL CHECK (length(bank_name) BETWEEN 1 AND 60),
  holder_name  text NOT NULL CHECK (length(holder_name) BETWEEN 1 AND 120),
  clabe        varchar(18) NOT NULL CHECK (clabe ~ '^[0-9]{18}$'),
  alias        text NOT NULL DEFAULT '' CHECK (length(alias) <= 60),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bank_accounts_clabe_key ON bank_accounts (clabe);

CREATE TRIGGER bank_accounts_set_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Turnos de caja. Al cerrar se guardan el efectivo esperado y el contado.
CREATE TABLE cash_shifts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_amount   numeric(12, 2) NOT NULL CHECK (opening_amount >= 0),
  opened_by        uuid REFERENCES public.users (id) ON DELETE SET NULL,
  opened_by_name   text NOT NULL DEFAULT '',
  opened_at        timestamptz NOT NULL DEFAULT now(),
  expected_amount  numeric(12, 2),
  counted_amount   numeric(12, 2) CHECK (counted_amount >= 0),
  closing_notes    text NOT NULL DEFAULT '' CHECK (length(closing_notes) <= 500),
  closed_by        uuid REFERENCES public.users (id) ON DELETE SET NULL,
  closed_by_name   text,
  closed_at        timestamptz,
  CONSTRAINT cash_shifts_closing_complete CHECK (
    (closed_at IS NULL AND expected_amount IS NULL AND counted_amount IS NULL)
    OR (closed_at IS NOT NULL AND expected_amount IS NOT NULL AND counted_amount IS NOT NULL)
  )
);

-- Una sola caja abierta por taller.
CREATE UNIQUE INDEX cash_shifts_single_open ON cash_shifts ((closed_at IS NULL)) WHERE closed_at IS NULL;
CREATE INDEX cash_shifts_opened_idx ON cash_shifts (opened_at DESC);

-- Entradas y salidas manuales de efectivo durante un turno.
CREATE TABLE cash_movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id    uuid NOT NULL REFERENCES cash_shifts (id),
  kind        text NOT NULL CHECK (kind IN ('in', 'out')),
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  reason      text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  user_id     uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name   text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_movements_shift_idx ON cash_movements (shift_id);

-- Ventas. folio es consecutivo por taller (cada schema tiene su propia secuencia).
CREATE TABLE sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           bigint GENERATED ALWAYS AS IDENTITY,
  shift_id        uuid NOT NULL REFERENCES cash_shifts (id),
  customer_name   text NOT NULL DEFAULT '' CHECK (length(customer_name) <= 120),
  subtotal        numeric(12, 2) NOT NULL CHECK (subtotal >= 0),
  tax_total       numeric(12, 2) NOT NULL CHECK (tax_total >= 0),
  total           numeric(12, 2) NOT NULL CHECK (total >= 0),
  cash_received   numeric(12, 2) CHECK (cash_received >= 0),
  change_amount   numeric(12, 2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  refunded_total  numeric(12, 2) NOT NULL DEFAULT 0,
  user_id         uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name       text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_folio_key UNIQUE (folio),
  CONSTRAINT sales_totals_check CHECK (total = subtotal + tax_total),
  CONSTRAINT sales_refunded_check CHECK (refunded_total BETWEEN 0 AND total)
);

CREATE INDEX sales_shift_idx ON sales (shift_id);
CREATE INDEX sales_created_idx ON sales (created_at DESC);

-- Renglones con copia del artículo al momento de vender (nombre, precio, IVA).
CREATE TABLE sale_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id            uuid NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  item_id            uuid REFERENCES items (id) ON DELETE SET NULL,
  item_name          text NOT NULL,
  barcode            varchar(64),
  track_stock        boolean NOT NULL,
  quantity           integer NOT NULL CHECK (quantity > 0),
  unit_price         numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  tax_rate           numeric(5, 2) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_included       boolean NOT NULL,
  subtotal           numeric(12, 2) NOT NULL,
  tax_amount         numeric(12, 2) NOT NULL,
  total              numeric(12, 2) NOT NULL,
  returned_quantity  integer NOT NULL DEFAULT 0,
  refunded_amount    numeric(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT sale_items_totals_check CHECK (total = subtotal + tax_amount),
  CONSTRAINT sale_items_returned_check CHECK (returned_quantity BETWEEN 0 AND quantity),
  CONSTRAINT sale_items_refunded_check CHECK (refunded_amount BETWEEN 0 AND total)
);

CREATE INDEX sale_items_sale_idx ON sale_items (sale_id);

-- Pagos de una venta (puede combinar métodos). amount es lo aplicado a la venta;
-- en efectivo, lo recibido y el cambio quedan en sales.
CREATE TABLE sale_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  method           text NOT NULL CHECK (method IN ('cash', 'debit_card', 'credit_card', 'transfer')),
  amount           numeric(12, 2) NOT NULL CHECK (amount > 0),
  bank_account_id  uuid REFERENCES bank_accounts (id),
  reference        text NOT NULL DEFAULT '' CHECK (length(reference) <= 60),
  CONSTRAINT sale_payments_transfer_account CHECK ((method = 'transfer') = (bank_account_id IS NOT NULL))
);

CREATE INDEX sale_payments_sale_idx ON sale_payments (sale_id);

-- Devoluciones (parciales o totales). Se registran en el turno abierto al momento.
CREATE TABLE sale_returns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        uuid NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  shift_id       uuid NOT NULL REFERENCES cash_shifts (id),
  refund_method  text NOT NULL CHECK (refund_method IN ('cash', 'debit_card', 'credit_card', 'transfer')),
  refund_total   numeric(12, 2) NOT NULL CHECK (refund_total >= 0),
  reason         text NOT NULL CHECK (length(reason) BETWEEN 1 AND 300),
  restocked      boolean NOT NULL DEFAULT true,
  user_id        uuid REFERENCES public.users (id) ON DELETE SET NULL,
  user_name      text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sale_returns_sale_idx ON sale_returns (sale_id);
CREATE INDEX sale_returns_shift_idx ON sale_returns (shift_id);

CREATE TABLE sale_return_items (
  return_id     uuid NOT NULL REFERENCES sale_returns (id) ON DELETE CASCADE,
  sale_item_id  uuid NOT NULL REFERENCES sale_items (id) ON DELETE CASCADE,
  quantity      integer NOT NULL CHECK (quantity > 0),
  amount        numeric(12, 2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (return_id, sale_item_id)
);
