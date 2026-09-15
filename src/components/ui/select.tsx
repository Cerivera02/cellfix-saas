"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import ReactSelect, { type ClassNamesConfig, type SingleValue } from "react-select";
import AsyncReactSelect from "react-select/async";

// Selects de la app sobre react-select, con el mismo estilo que los inputs.
// Úsalos para todos los selects. Con `name` envían el valor en el FormData como un campo normal.

export type SelectOption = { value: string; label: string; detail?: string };

function buildClassNames(invalid?: boolean): ClassNamesConfig<SelectOption, false> {
  return {
    control: (state) =>
      `min-h-[42px] rounded-lg border bg-white px-3.5 text-sm transition ${
        state.isFocused
          ? "border-zinc-900 ring-1 ring-zinc-900"
          : invalid
            ? "border-red-300"
            : "border-zinc-200 hover:border-zinc-300"
      } ${state.isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`,
    placeholder: () => "text-zinc-400",
    singleValue: () => "text-zinc-900",
    input: () => "text-zinc-900",
    indicatorSeparator: () => "hidden",
    clearIndicator: () => "mr-1 text-zinc-400 transition hover:text-zinc-900",
    dropdownIndicator: (state) => `transition ${state.isFocused ? "text-zinc-900" : "text-zinc-400"}`,
    menu: () => "z-50 mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg",
    option: (state) =>
      `cursor-pointer px-3.5 py-2 ${state.isSelected ? "font-medium text-zinc-900" : "text-zinc-700"} ${
        state.isFocused ? "bg-zinc-100" : ""
      }`,
    noOptionsMessage: () => "px-3.5 py-2 text-zinc-500",
    loadingMessage: () => "px-3.5 py-2 text-zinc-500",
  };
}

// En el menú muestra el detalle (teléfono, correo…) debajo del nombre.
function formatOptionLabel(option: SelectOption, meta: { context: "menu" | "value" }) {
  if (meta.context !== "menu" || !option.detail) return option.label;
  return (
    <div>
      <div>{option.label}</div>
      <div className="text-xs text-zinc-500">{option.detail}</div>
    </div>
  );
}

// react-select bloquea Escape aunque el menú esté cerrado; dentro de un modal lo usamos
// para cerrar la ventana, igual que en los demás campos.
function useEscapeClosesDialog() {
  const menuOpenRef = useRef(false);
  return {
    onMenuOpen: () => {
      menuOpenRef.current = true;
    },
    onMenuClose: () => {
      menuOpenRef.current = false;
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape" || menuOpenRef.current) return;
      const dialog = event.currentTarget.closest("dialog");
      if (dialog?.open) {
        event.preventDefault();
        dialog.close();
      }
    },
  };
}

export function Select({
  id,
  name,
  options,
  defaultValue,
  placeholder = "Selecciona…",
  isSearchable = false,
  isClearable = false,
  isDisabled,
  invalid,
  onChange,
}: {
  id?: string;
  name?: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  isSearchable?: boolean;
  isClearable?: boolean;
  isDisabled?: boolean;
  invalid?: boolean;
  onChange?: (value: string | null) => void;
}) {
  // instanceId estable evita diferencias de ids entre el servidor y el cliente.
  const instanceId = useId();
  const escapeHandlers = useEscapeClosesDialog();

  return (
    <ReactSelect<SelectOption, false>
      instanceId={instanceId}
      inputId={id}
      name={name}
      options={options}
      defaultValue={options.find((option) => option.value === defaultValue)}
      placeholder={placeholder}
      isSearchable={isSearchable}
      isClearable={isClearable}
      isDisabled={isDisabled}
      aria-invalid={invalid}
      noOptionsMessage={() => "Sin resultados"}
      onChange={(option: SingleValue<SelectOption>) => onChange?.(option?.value ?? null)}
      formatOptionLabel={formatOptionLabel}
      // Menú fijo: dentro de ventanas modales evita que el contenedor lo recorte.
      menuPosition="fixed"
      unstyled
      classNames={buildClassNames(invalid)}
      {...escapeHandlers}
    />
  );
}

// Select con búsqueda en el servidor (por ejemplo, clientes). Controlado: recibe `value`.
export function AsyncSelect({
  id,
  name,
  value,
  onChange,
  loadOptions,
  placeholder = "Escribe para buscar…",
  isDisabled,
  invalid,
}: {
  id?: string;
  name?: string;
  value: SelectOption | null;
  onChange: (option: SelectOption | null) => void;
  loadOptions: (query: string) => Promise<SelectOption[]>;
  placeholder?: string;
  isDisabled?: boolean;
  invalid?: boolean;
}) {
  const instanceId = useId();
  const escapeHandlers = useEscapeClosesDialog();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Espera a que se deje de escribir para no consultar al servidor en cada tecla.
  const debouncedLoad = (query: string) =>
    new Promise<SelectOption[]>((resolve) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        loadOptions(query).then(resolve, () => resolve([]));
      }, 250);
    });

  return (
    <AsyncReactSelect<SelectOption, false>
      instanceId={instanceId}
      inputId={id}
      name={name}
      value={value}
      onChange={(option) => onChange(option ?? null)}
      loadOptions={debouncedLoad}
      defaultOptions
      isClearable
      isDisabled={isDisabled}
      aria-invalid={invalid}
      placeholder={placeholder}
      loadingMessage={() => "Buscando…"}
      noOptionsMessage={({ inputValue }) => (inputValue ? "Sin resultados" : "Escribe para buscar")}
      formatOptionLabel={formatOptionLabel}
      menuPosition="fixed"
      unstyled
      classNames={buildClassNames(invalid)}
      {...escapeHandlers}
    />
  );
}
