"use client";

import { useState } from "react";
import { BankAccountForm } from "@/components/cash/bank-account-form";
import { NavIcon, type IconName } from "@/components/shell/nav-icon";
import { ghostButtonClass, primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { BankAccountInput } from "@/lib/cash/core";
import type { FormState } from "@/lib/form-state";

export function BankAccountDialogButton({
  label,
  icon,
  iconOnly = false,
  variant = "primary",
  title,
  action,
  defaults,
  submitLabel,
}: {
  label: string;
  // Ícono opcional; con iconOnly el texto queda como tooltip y para lectores de pantalla.
  icon?: IconName;
  iconOnly?: boolean;
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
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
        className={`${variant === "primary" ? primaryButtonClass : ghostButtonClass} inline-flex items-center gap-1.5`}
      >
        {icon && <NavIcon name={icon} className="size-4" />}
        {!iconOnly && label}
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
