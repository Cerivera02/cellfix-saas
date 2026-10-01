"use client";

import { useActionState, useState } from "react";
import { login } from "@/lib/auth/actions";
import { NavIcon } from "@/components/shell/nav-icon";
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
          placeholder="tu@correo.com"
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
            placeholder="Tu contraseña"
            autoComplete="current-password"
            required
            className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-controls="password"
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-1 right-1 z-10 grid w-9 cursor-pointer place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
          >
            <NavIcon name={showPassword ? "eyeOff" : "eye"} className="size-[1.1rem]" />
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
