"use client";

import { useEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from "react";
import { inputClass } from "@/components/ui/form";

// Solo dígitos, punto decimal y hasta 2 decimales (sin comas ni signos): "150", "150.5", "150.50".
// Mientras se escribe se permiten "150." o ".5"; al salir del campo se normalizan.
const DECIMAL_TYPING_PATTERN = /^\d*(\.\d{0,2})?$/;

// "12." → "12", ".5" → "0.5", "." → "".
export function normalizeDecimal(text: string) {
  const trimmed = text.endsWith(".") ? text.slice(0, -1) : text;
  return trimmed.startsWith(".") ? `0${trimmed}` : trimmed;
}

type DecimalInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange"
> & {
  // Con `value` es controlado; con `defaultValue` (y `name`) viaja en el FormData del formulario.
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

// Campo numérico con decimales: rechaza lo que se escriba o pegue fuera del formato.
export function DecimalInput({ value, defaultValue, onChange, onBlur, onKeyDown, className, ...props }: DecimalInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // Texto y selección justo antes de cada cambio, para deshacer lo que no cumpla el formato.
  const previous = useRef({ text: "", start: 0, end: 0 });

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const remember = () => {
      previous.current = {
        text: input.value,
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length,
      };
    };
    input.addEventListener("beforeinput", remember);
    return () => input.removeEventListener("beforeinput", remember);
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (DECIMAL_TYPING_PATTERN.test(input.value)) {
      onChange?.(input.value);
      return;
    }
    const { text, start, end } = previous.current;
    input.value = DECIMAL_TYPING_PATTERN.test(text) ? text : "";
    input.setSelectionRange(start, end);
  };

  const normalize = (input: HTMLInputElement) => {
    const normalized = normalizeDecimal(input.value);
    if (normalized === input.value) return;
    input.value = normalized;
    onChange?.(normalized);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      onBlur={(event) => {
        normalize(event.currentTarget);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        // Enter envía el formulario sin salir del campo: se normaliza antes.
        if (event.key === "Enter") normalize(event.currentTarget);
        onKeyDown?.(event);
      }}
      className={`${inputClass} tabular-nums${className ? ` ${className}` : ""}`}
    />
  );
}

// Importe en pesos: DecimalInput con el signo "$" al frente.
export function MoneyInput({
  wrapperClassName,
  style,
  ...props
}: DecimalInputProps & { wrapperClassName?: string }) {
  return (
    <div className={wrapperClassName ? `relative ${wrapperClassName}` : "relative"}>
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-zinc-400">$</span>
      <DecimalInput placeholder="0.00" {...props} style={{ paddingLeft: "1.75rem", ...style }} />
    </div>
  );
}
