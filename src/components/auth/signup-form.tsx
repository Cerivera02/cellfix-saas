"use client";

import { useActionState, useState } from "react";
import { signup } from "@/lib/auth/signup";
import { NavIcon } from "@/components/shell/nav-icon";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Field, RequiredMark, buttonClass, inputClass } from "@/components/ui/form";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const errors = state?.errors;

  return (
    <form action={formAction} className="flex flex-col gap-3.5" noValidate>
      <p className="text-xs text-zinc-500">
        Los campos con <span className="text-red-600">*</span> son obligatorios.
      </p>

      <Field label="Nombre de tu negocio" name="businessName" error={errors?.businessName} required>
        <input
          id="businessName"
          name="businessName"
          type="text"
          autoComplete="organization"
          required
          autoFocus
          maxLength={150}
          placeholder="Ej. Reparaciones Díaz"
          defaultValue={state?.fields?.businessName}
          className={inputClass}
        />
      </Field>

      <Field label="Tu nombre" name="name" error={errors?.name} required>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={100}
          placeholder="Ej. María López"
          defaultValue={state?.fields?.name}
          className={inputClass}
        />
      </Field>

      <Field label="Correo" name="email" error={errors?.email} required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          placeholder="tu@correo.com"
          defaultValue={state?.fields?.email}
          className={inputClass}
        />
      </Field>

      <Field
        label="Contraseña"
        name="password"
        error={errors?.password}

        required
      >
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
        <PasswordStrength password={password} minLength={PASSWORD_MIN_LENGTH} />
      </Field>

      {/* Campo trampa para bots: fuera de la vista y del orden de tabulación. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">No llenes este campo</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-600">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 shrink-0 accent-zinc-900" />
          <span>
            Acepto los términos del servicio y el aviso de privacidad de CellFix.
            <RequiredMark />
          </span>
        </label>
        {errors?.terms && <p className="text-xs text-red-600">{errors.terms}</p>}
      </div>

      <p aria-live="polite" className="min-h-5 text-sm text-red-600">
        {state?.message}
      </p>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creando tu cuenta…" : "Crear cuenta gratis"}
      </button>
    </form>
  );
}
