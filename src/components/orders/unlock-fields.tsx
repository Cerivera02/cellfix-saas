"use client";

import { useState } from "react";
import { PatternInput } from "@/components/orders/pattern-input";
import { inputClass } from "@/components/ui/form";
import { UNLOCK_TYPES, UNLOCK_TYPE_LABELS, isUnlockType, type UnlockType } from "@/lib/orders/labels";

const HINTS: Record<UnlockType, string> = {
  none: "Si el equipo tiene bloqueo, pídelo: el técnico lo necesita para probarlo.",
  pin: "Solo números, de 4 a 16 dígitos.",
  password: "Escríbela tal cual: distingue mayúsculas, minúsculas y símbolos.",
  pattern: "Dibújalo como lo hace el cliente, empezando por el mismo punto.",
};

// Tipo de bloqueo y su valor. Envía `unlockType` y `unlockCode` en el formulario.
export function UnlockFields({
  id,
  defaultType,
  defaultCode,
  error,
}: {
  id: string;
  defaultType?: string;
  defaultCode?: string;
  error?: string;
}) {
  const initialType: UnlockType = defaultType && isUnlockType(defaultType) ? defaultType : "none";
  const [type, setType] = useState<UnlockType>(initialType);
  // Un valor por tipo: cambiar de tipo no borra lo que ya se capturó en otro.
  const [codes, setCodes] = useState<Record<UnlockType, string>>(() => ({
    none: "",
    pin: "",
    password: "",
    pattern: "",
    ...(initialType === "none" ? {} : { [initialType]: defaultCode ?? "" }),
  }));
  const code = codes[type];
  const setCode = (value: string) => setCodes((current) => ({ ...current, [type]: value }));

  return (
    <fieldset>
      <legend className="text-sm font-medium text-zinc-700">Desbloqueo del equipo</legend>
      <input type="hidden" name="unlockType" value={type} />
      <input type="hidden" name="unlockCode" value={type === "none" ? "" : code} />

      <div role="radiogroup" aria-label="Tipo de bloqueo" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {UNLOCK_TYPES.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center justify-center rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 has-checked:border-zinc-900 has-checked:bg-zinc-900 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-zinc-900 has-focus-visible:ring-offset-1"
          >
            <input
              type="radio"
              checked={type === option}
              onChange={() => setType(option)}
              className="sr-only"
            />
            {UNLOCK_TYPE_LABELS[option]}
          </label>
        ))}
      </div>

      {type === "pin" && (
        <input
          id={`${id}-pin`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="PIN"
          maxLength={16}
          placeholder="1234"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          className={`mt-3 ${inputClass} font-mono tracking-widest sm:w-56`}
        />
      )}

      {type === "password" && (
        <input
          id={`${id}-password`}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Contraseña"
          maxLength={60}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className={`mt-3 ${inputClass} font-mono sm:w-80`}
        />
      )}

      {type === "pattern" && (
        <div className="mt-3">
          <PatternInput value={code} onChange={setCode} />
        </div>
      )}

      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-zinc-500">{HINTS[type]}</p>
      )}
    </fieldset>
  );
}
