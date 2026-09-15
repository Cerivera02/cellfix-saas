"use client";

import { useState } from "react";
import { MemberForm } from "@/components/team/member-form";
import { primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";
import type { RoleOptions } from "@/lib/team/view";

export function AddMemberDialog({
  action,
  roleOptions,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  roleOptions: RoleOptions;
}) {
  const [open, setOpen] = useState(false);
  // Cambiar la key al abrir vuelve a montar el formulario limpio.
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
        className={primaryButtonClass}
      >
        Agregar usuario
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar usuario"
        description="Podrá iniciar sesión en /login con este correo y contraseña."
        size="lg"
      >
        <MemberForm
          key={formKey}
          action={action}
          roleOptions={roleOptions}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
