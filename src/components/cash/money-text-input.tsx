"use client";

import { inputClass } from "@/components/ui/form";

// Importe controlado (para cálculos en vivo), con el mismo aspecto que MoneyInput.
export function MoneyTextInput({
  id,
  name,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-zinc-400">$</span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} tabular-nums`}
        style={{ paddingLeft: "1.75rem" }}
      />
    </div>
  );
}
