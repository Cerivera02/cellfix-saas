-- Artículos que no llevan conteo de existencias (servicios, consumibles, etc.).
-- Los existentes siguen controlando existencias.

ALTER TABLE items ADD COLUMN track_stock boolean NOT NULL DEFAULT true;

-- Un artículo sin control de existencias siempre tiene stock 0; al desactivarlo la app
-- registra antes un ajuste a 0 para que el historial cuadre.
ALTER TABLE items ADD CONSTRAINT items_untracked_without_stock CHECK (track_stock OR stock = 0);
