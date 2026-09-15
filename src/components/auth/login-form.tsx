"use client";

import { useActionState } from "react";
import { login } from "@/lib/auth/actions";
import { Field, buttonClass, inputClass } from "@/components/ui/form";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Correo" name="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.fields?.email}
          className={inputClass}
        />
      </Field>

      <Field label="Contraseña" name="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
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
