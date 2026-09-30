"use client";

import { useActionState, useState } from "react";
import { login } from "@/lib/auth/actions";
import { Field, buttonClass, inputClass } from "@/components/ui/form";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Correo" name="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state?.fields?.email}
          className={inputClass}
        />
      </Field>

      <Field label="Contraseña" name="password">
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${inputClass} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            aria-controls="password"
            className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </Field>

      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {state?.message}
      </p>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
