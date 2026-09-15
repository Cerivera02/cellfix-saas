"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import type { FormState } from "@/lib/form-state";

export function DeleteRoleButton({
  roleName,
  action,
}: {
  roleName: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <ConfirmSubmitButton
        message={`¿Borrar el rol ${roleName}?`}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        Borrar
      </ConfirmSubmitButton>
      {state?.message && <p className="max-w-56 text-right text-xs text-red-600">{state.message}</p>}
    </form>
  );
}
