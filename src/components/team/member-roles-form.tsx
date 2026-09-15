"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { RolePicker } from "@/components/team/role-picker";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import type { RoleOptions } from "@/lib/team/view";

export function MemberRolesForm({
  action,
  roleOptions,
  systemRoles,
  customRoles,
  onSuccess,
  onCancel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  roleOptions: RoleOptions;
  systemRoles: readonly string[];
  customRoles: readonly string[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onSuccess();
    return result;
  }, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <RolePicker
        options={roleOptions}
        systemRoles={state?.selections?.systemRoles ?? systemRoles}
        customRoles={state?.selections?.customRoles ?? customRoles}
        error={state?.errors?.roles}
      />

      <FormMessage state={state} />

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : "Guardar roles"}
        </button>
      </div>
    </form>
  );
}
