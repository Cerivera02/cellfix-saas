"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { RolePicker } from "@/components/team/role-picker";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import type { RoleOptions } from "@/lib/team/view";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function MemberForm({
  action,
  roleOptions,
  onSuccess,
  onCancel,
}: {
  action: Action;
  roleOptions: RoleOptions;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onSuccess();
    return result;
  }, undefined);
  const id = useId();
  const fields = state?.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" name={`${id}-name`} error={state?.errors?.name}>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="off"
          required
          defaultValue={fields.name}
          className={inputClass}
        />
      </Field>

      <Field label="Correo" name={`${id}-email`} error={state?.errors?.email}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="off"
          required
          defaultValue={fields.email}
          className={inputClass}
        />
      </Field>

      <Field label="Contraseña inicial" name={`${id}-password`} error={state?.errors?.password} hint="Mínimo 8 caracteres.">
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </Field>

      <RolePicker
        options={roleOptions}
        systemRoles={state?.selections?.systemRoles}
        customRoles={state?.selections?.customRoles}
        error={state?.errors?.roles}
      />

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Agregando…" : "Agregar usuario"}
        </button>
      </div>
    </form>
  );
}
