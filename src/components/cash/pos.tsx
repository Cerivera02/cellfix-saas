"use client";

import { useRef, useState, useTransition } from "react";
import { PaymentDialog, type AccountOption } from "@/components/cash/payment-dialog";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { SelectOption } from "@/components/ui/select";
import { dangerGhostButtonClass, ghostButtonClass, inputClass, primaryButtonClass } from "@/components/ui/form";
import { IntegerInput } from "@/components/ui/money-input";
import { searchItemsAction } from "@/lib/cash/actions";
import type { SellableItem } from "@/lib/cash/core";
import { computeLine, fromCents, toCents } from "@/lib/cash/money";
import { describeTax, formatMoney } from "@/lib/inventory/format";

type CartLine = { item: SellableItem; quantity: number };

function lineAmounts(item: SellableItem, quantity: number) {
  return computeLine({
    unitPriceCents: toCents(item.salePrice),
    quantity,
    taxRate: Number(item.taxRate),
    taxIncluded: item.taxIncluded,
  });
}

export function Pos({ accounts }: { accounts: AccountOption[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellableItem[] | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<SelectOption | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addToCart = (item: SellableItem) => {
    const current = cart.find((line) => line.item.id === item.id)?.quantity ?? 0;
    if (item.trackStock && current + 1 > item.stock) {
      setNotice(item.stock === 0 ? `${item.name} está agotado.` : `Solo hay ${item.stock} de ${item.name} en existencia.`);
      return;
    }
    setNotice(null);
    setCart((lines) => {
      const existing = lines.find((line) => line.item.id === item.id);
      if (!existing) return [...lines, { item, quantity: 1 }];
      const quantity = item.trackStock ? Math.min(existing.quantity + 1, item.stock) : existing.quantity + 1;
      return lines.map((line) => (line.item.id === item.id ? { ...line, quantity } : line));
    });
  };

  // Con `addExact`, un código de barras exacto (o un único resultado) se agrega directo:
  // así funciona el lector, que escribe el código y pulsa Enter.
  const runSearch = (text: string, addExact: boolean) => {
    startSearch(async () => {
      const items = await searchItemsAction(text);
      const exact = addExact
        ? (items.find((item) => item.barcode === text.trim()) ?? (items.length === 1 ? items[0] : undefined))
        : undefined;
      if (exact) {
        addToCart(exact);
        setQuery("");
        setResults(null);
      } else {
        setResults(items);
      }
    });
  };

  const setQuantity = (itemId: string, value: number) => {
    setCart((lines) =>
      lines.map((line) => {
        if (line.item.id !== itemId) return line;
        const max = line.item.trackStock ? line.item.stock : 100_000;
        return { ...line, quantity: Math.max(1, Math.min(max, Math.floor(value) || 1)) };
      }),
    );
  };

  const computed = cart.map((line) => ({ ...line, amounts: lineAmounts(line.item, line.quantity) }));
  const subtotal = computed.reduce((sum, line) => sum + line.amounts.subtotal, 0);
  const tax = computed.reduce((sum, line) => sum + line.amounts.tax, 0);
  const total = computed.reduce((sum, line) => sum + line.amounts.total, 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <label htmlFor="pos-search" className="text-sm font-medium text-zinc-700">
          Buscar artículo
        </label>
        <input
          id="pos-search"
          type="search"
          autoComplete="off"
          placeholder="Nombre o código de barras (puedes escanearlo)"
          value={query}
          onChange={(event) => {
            const text = event.target.value;
            setQuery(text);
            if (searchTimer.current) clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(() => runSearch(text, false), 250);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (searchTimer.current) clearTimeout(searchTimer.current);
            runSearch(query, true);
          }}
          className={`mt-1.5 ${inputClass}`}
        />

        <div className="mt-4">
          {results === null ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              Escribe para buscar o escanea el código de barras y pulsa Enter.
            </p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              {isSearching ? "Buscando…" : "No hay artículos a la venta con esa búsqueda."}
            </p>
          ) : (
            <ul className={`divide-y divide-zinc-100 ${isSearching ? "opacity-60" : ""}`}>
              {results.map((item) => {
                const soldOut = item.trackStock && item.stock === 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={soldOut}
                      onClick={() => addToCart(item)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900">{item.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {item.trackStock ? (soldOut ? "Agotado" : `${item.stock} en existencia`) : "Sin control de existencias"}
                          {item.barcode && <span className="font-mono"> · {item.barcode}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium text-zinc-900 tabular-nums">
                          {formatMoney(fromCents(lineAmounts(item, 1).total))}
                        </span>
                        <span className="block text-xs text-zinc-400">{describeTax(item.taxRate, item.taxIncluded)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 lg:sticky lg:top-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Venta actual</h2>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])} className={ghostButtonClass}>
              Vaciar
            </button>
          )}
        </div>

        <div className="mt-4">
          <CustomerPicker id="pos-customer" value={customer} onChange={setCustomer} />
        </div>

        {notice && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

        {computed.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Agrega artículos desde la búsqueda.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {computed.map((line) => (
              <li key={line.item.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{line.item.name}</p>
                    <p className="text-xs text-zinc-500">
                      {formatMoney(line.item.salePrice)} · {describeTax(line.item.taxRate, line.item.taxIncluded)}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-zinc-900 tabular-nums">
                    {formatMoney(fromCents(line.amounts.total))}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Quitar una pieza de ${line.item.name}`}
                      onClick={() => setQuantity(line.item.id, line.quantity - 1)}
                      className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    >
                      −
                    </button>
                    <IntegerInput
                      bare
                      aria-label={`Cantidad de ${line.item.name}`}
                      value={String(line.quantity)}
                      onChange={(value) => setQuantity(line.item.id, Number(value))}
                      className="h-8 w-14 rounded-lg border border-zinc-200 text-center text-sm"
                    />
                    <button
                      type="button"
                      aria-label={`Agregar una pieza de ${line.item.name}`}
                      onClick={() => addToCart(line.item)}
                      className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCart((lines) => lines.filter((item) => item.item.id !== line.item.id))}
                    className={dangerGhostButtonClass}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-4 space-y-1 border-t border-zinc-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-600">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(fromCents(subtotal))}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-600">IVA</dt>
            <dd className="tabular-nums">{formatMoney(fromCents(tax))}</dd>
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <dt className="font-medium">Total</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(fromCents(total))}</dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={cart.length === 0 || !customer}
          onClick={() => setPaying(true)}
          className={`mt-4 w-full py-3 ${primaryButtonClass}`}
        >
          Cobrar {cart.length > 0 && formatMoney(fromCents(total))}
        </button>
        {cart.length > 0 && !customer && (
          <p className="mt-2 text-center text-xs text-zinc-500">Elige o registra al cliente para cobrar.</p>
        )}
      </section>

      <PaymentDialog
        open={paying}
        onClose={() => setPaying(false)}
        totalCents={total}
        accounts={accounts}
        sale={{
          customerId: customer?.value ?? "",
          lines: cart.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
        }}
      />
    </div>
  );
}
