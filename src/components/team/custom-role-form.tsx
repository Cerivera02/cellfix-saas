"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { PermissionPicker } from "@/components/team/permission-picker";
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import type { Permission } from "@/lib/permissions";

export type CustomRoleDefaults = { name: string; description: string; permissions: Permission[] };

export function CustomRoleForm({
  action,
  defaults,
  disabledPermissions,
  hiddenPermissions,
  submitLabel,
  onSuccess,
  onCancel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: CustomRoleDefaults;
  disabledPermissions: Permission[];
  hiddenPermissions: Permission[];
  submitLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onSuccess();
    return result;
  }, undefined);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" name={`${id}-name`} error={state?.errors?.name}>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="off"
          required
          maxLength={60}
          defaultValue={state?.fields?.name ?? defaults?.name}
          className={inputClass}
        />
      </Field>

      <Field label="Descripción" name={`${id}-description`} hint="Opcional. Ayuda a elegir el rol correcto.">
        <input
          id={`${id}-description`}
          name="description"
          type="text"
          autoComplete="off"
          maxLength={200}
          defaultValue={state?.fields?.description ?? defaults?.description}
          className={inputClass}
        />
      </Field>

      <PermissionPicker
        selected={state?.selections?.permissions ?? defaults?.permissions ?? []}
        disabled={disabledPermissions}
        hidden={hiddenPermissions}
        error={state?.errors?.permissions}
      />

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
