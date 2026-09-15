"use client";

import { useState } from "react";
import { CustomRoleForm, type CustomRoleDefaults } from "@/components/team/custom-role-form";
import { primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";
import type { Permission } from "@/lib/permissions";

export function RoleDialogButton({
  label,
  variant = "primary",
  title,
  description,
  action,
  defaults,
  disabledPermissions,
  submitLabel,
}: {
  label: string;
  variant?: "primary" | "ghost";
  title: string;
  description?: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: CustomRoleDefaults;
  disabledPermissions: Permission[];
  submitLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // Cambiar la key al abrir vuelve a montar el formulario con los valores actuales.
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormKey((key) => key + 1);
          setOpen(true);
        }}
        className={
          variant === "primary"
            ? primaryButtonClass
            : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
        }
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} size="lg">
        <CustomRoleForm
          key={formKey}
          action={action}
          defaults={defaults}
          disabledPermissions={disabledPermissions}
          submitLabel={submitLabel}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
