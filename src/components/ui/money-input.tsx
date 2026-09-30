"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { inputClass } from "@/components/ui/form";

// Solo dígitos, punto decimal y hasta 2 decimales (sin comas ni signos): "150", "150.5", "150.50".
// Mientras se escribe se permiten "150." o ".5"; al salir del campo se normalizan.
const DECIMAL_TYPING_PATTERN = /^\d*(\.\d{0,2})?$/;

// Enteros no negativos: solo dígitos, sin signos, puntos ni exponentes.
const INTEGER_TYPING_PATTERN = /^\d*$/;

// "12." → "12", ".5" → "0.5", "." → "".
export function normalizeDecimal(text: string) {
  const trimmed = text.endsWith(".") ? text.slice(0, -1) : text;
  return trimmed.startsWith(".") ? `0${trimmed}` : trimmed;
}

// "007" → "7", "000" → "0", "" → "".
export function normalizeInteger(text: string) {
  return text.replace(/^0+(?=\d)/, "");
}

type NumericInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange"
> & {
  // Con `value` es controlado; con `defaultValue` (y `name`) viaja en el FormData del formulario.
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

// Recuerda el texto y la selección justo antes de cada cambio, para deshacer lo que no cumpla el
// formato (lo escrito o pegado) sin mover el cursor.
function useTypingGuard(pattern: RegExp) {
  const ref = useRef<HTMLInputElement>(null);
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

  // true si lo escrito cumple el formato; si no, regresa al texto anterior.
  const accept = (input: HTMLInputElement) => {
    if (pattern.test(input.value)) return true;
    const { text, start, end } = previous.current;
    input.value = pattern.test(text) ? text : "";
    input.setSelectionRange(start, end);
    return false;
  };

  return { ref, accept };
}

// Campo numérico con decimales: rechaza lo que se escriba o pegue fuera del formato.
export function DecimalInput({ value, defaultValue, onChange, onBlur, onKeyDown, className, ...props }: NumericInputProps) {
  const { ref, accept } = useTypingGuard(DECIMAL_TYPING_PATTERN);

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
      onChange={(event) => {
        if (accept(event.currentTarget)) onChange?.(event.currentTarget.value);
      }}
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

// Campo de números enteros (cantidades, días, existencias): solo dígitos. Con `max`, lo que lo
// supere regresa al máximo. Con `bare` no lleva el estilo de campo (para contadores compactos).
export function IntegerInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  onKeyDown,
  max,
  bare = false,
  className,
  ...props
}: Omit<NumericInputProps, "max" | "min" | "step"> & { max?: number; bare?: boolean }) {
  const { ref, accept } = useTypingGuard(INTEGER_TYPING_PATTERN);

  const normalize = (input: HTMLInputElement) => {
    const normalized = normalizeInteger(input.value);
    if (normalized === input.value) return;
    input.value = normalized;
    onChange?.(normalized);
  };

  const base = bare ? "tabular-nums" : `${inputClass} tabular-nums`;

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={value}
      defaultValue={defaultValue}
      onChange={(event) => {
        const input = event.currentTarget;
        if (!accept(input)) return;
        if (max !== undefined && input.value !== "" && Number(input.value) > max) input.value = String(max);
        onChange?.(input.value);
      }}
      onBlur={(event) => {
        normalize(event.currentTarget);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        // Enter envía el formulario sin salir del campo: se normaliza antes.
        if (event.key === "Enter") normalize(event.currentTarget);
        onKeyDown?.(event);
      }}
      className={className ? `${base} ${className}` : base}
    />
  );
}

// Importe en pesos: DecimalInput con el signo "$" al frente.
export function MoneyInput({
  wrapperClassName,
  style,
  ...props
}: NumericInputProps & { wrapperClassName?: string }) {
  return (
    <div className={wrapperClassName ? `relative ${wrapperClassName}` : "relative"}>
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-zinc-400">$</span>
      <DecimalInput placeholder="0.00" {...props} style={{ paddingLeft: "1.75rem", ...style }} />
    </div>
  );
}
