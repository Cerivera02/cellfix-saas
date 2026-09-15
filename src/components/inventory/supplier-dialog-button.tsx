"use client";

import { useState } from "react";
import { SupplierForm } from "@/components/inventory/supplier-form";
import { ghostButtonClass, primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";
import type { SupplierInput } from "@/lib/inventory/core";

export function SupplierDialogButton({
  label,
  variant = "primary",
  title,
  action,
  defaults,
  submitLabel,
}: {
  label: string;
  variant?: "primary" | "ghost";
  title: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: SupplierInput;
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
        className={variant === "primary" ? primaryButtonClass : ghostButtonClass}
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">
        <SupplierForm
          key={formKey}
          action={action}
          defaults={defaults}
          submitLabel={submitLabel}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
