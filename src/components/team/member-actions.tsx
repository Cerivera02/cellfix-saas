"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { MemberRolesForm } from "@/components/team/member-roles-form";
import { SetPasswordForm } from "@/components/team/set-password-form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";
import type { RoleOptions } from "@/lib/team/view";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const actionButtonClass =
  "rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900";

export function MemberActions({
  memberName,
  roleOptions,
  systemRoles,
  customRoles,
  canEditRoles,
  canChangePassword,
  canRemove,
  updateRolesAction,
  setPasswordAction,
  removeAction,
}: {
  memberName: string;
  roleOptions: RoleOptions;
  systemRoles: readonly string[];
  customRoles: readonly string[];
  canEditRoles: boolean;
  canChangePassword: boolean;
  canRemove: boolean;
  updateRolesAction: Action;
  setPasswordAction: Action;
  removeAction: Action;
}) {
  const [dialog, setDialog] = useState<"roles" | "password" | null>(null);
  // Cambiar la key al abrir vuelve a montar el formulario limpio.
  const [formKey, setFormKey] = useState(0);
  const [removeState, removeFormAction] = useActionState(removeAction, undefined);

  const openDialog = (name: "roles" | "password") => {
    setFormKey((key) => key + 1);
    setDialog(name);
  };
  const closeDialog = () => setDialog(null);

  if (!canEditRoles && !canChangePassword && !canRemove) {
    return <p className="text-right text-xs text-zinc-400">Sin acciones</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        {canEditRoles && (
          <button type="button" onClick={() => openDialog("roles")} className={actionButtonClass}>
            Roles
          </button>
        )}
        {canChangePassword && (
          <button type="button" onClick={() => openDialog("password")} className={actionButtonClass}>
            Contraseña
          </button>
        )}
        {canRemove && (
          <form action={removeFormAction}>
            <ConfirmSubmitButton
              message={`¿Quitar a ${memberName} del taller? Perderá el acceso de inmediato.`}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              Quitar
            </ConfirmSubmitButton>
          </form>
        )}
      </div>

      {removeState?.message && <p className="max-w-64 text-right text-xs text-red-600">{removeState.message}</p>}

      <Modal
        open={dialog === "roles"}
        onClose={closeDialog}
        title="Editar roles"
        description={`Roles de ${memberName}. Los cambios aplican de inmediato.`}
        size="lg"
      >
        <MemberRolesForm
          key={`roles-${formKey}`}
          action={updateRolesAction}
          roleOptions={roleOptions}
          systemRoles={systemRoles}
          customRoles={customRoles}
          onSuccess={closeDialog}
          onCancel={closeDialog}
        />
      </Modal>

      <Modal
        open={dialog === "password"}
        onClose={closeDialog}
        title="Cambiar contraseña"
        description={`Nueva contraseña para ${memberName}. Se cerrarán sus sesiones abiertas.`}
      >
        <SetPasswordForm key={`password-${formKey}`} action={setPasswordAction} onDone={closeDialog} />
      </Modal>
    </div>
  );
}
