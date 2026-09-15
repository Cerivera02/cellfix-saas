"use client";

import { useState } from "react";
import { BankAccountForm } from "@/components/cash/bank-account-form";
import { ghostButtonClass, primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { BankAccountInput } from "@/lib/cash/core";
import type { FormState } from "@/lib/form-state";

export function BankAccountDialogButton({
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
  defaults?: BankAccountInput;
  submitLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "primary" ? primaryButtonClass : ghostButtonClass}
      >
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">
        {open && (
          <BankAccountForm
            action={action}
            defaults={defaults}
            submitLabel={submitLabel}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
