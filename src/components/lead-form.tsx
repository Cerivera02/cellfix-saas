"use client";

import { useActionState } from "react";
import { submitLead, type LeadFormState } from "@/app/actions";
import { Field, inputClass } from "@/components/ui/form";

const initialState: LeadFormState = { status: "idle", message: "" };

export function LeadForm() {
  const [state, formAction, pending] = useActionState(submitLead, initialState);

  if (state.status === "success") {
    return (
      <div className="rounded-2xl border border-zinc-200 p-8 text-center">
        <p className="text-base font-medium text-zinc-900">{state.message}</p>
        <p className="mt-2 text-sm text-zinc-500">
          Responderemos a tu correo en menos de 24 horas hábiles.
        </p>
      </div>
    );
  }

  const fields = state.fields ?? {};

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Nombre" name="name" error={state.errors?.name}>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          defaultValue={fields.name}
          className={inputClass}
        />
      </Field>

      <Field label="Correo" name="email" error={state.errors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={fields.email}
          className={inputClass}
        />
      </Field>

      <Field label="Nombre del negocio" name="business" error={state.errors?.business}>
        <input
          id="business"
          name="business"
          type="text"
          autoComplete="organization"
          required
          defaultValue={fields.business}
          className={inputClass}
        />
      </Field>

      <Field label="Teléfono (opcional)" name="phone">
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={fields.phone}
          className={inputClass}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Tu pregunta (opcional)" name="message">
          <textarea
            id="message"
            name="message"
            rows={4}
            defaultValue={fields.message}
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>

      {/* Honeypot anti-spam: oculto para personas. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={`text-sm ${state.status === "error" ? "text-red-600" : "text-zinc-500"}`}
        >
          {state.status === "error" ? state.message : "Te respondemos a tu correo."}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar mensaje"}
        </button>
      </div>
    </form>
  );
}
