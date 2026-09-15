"use client";

import { useState } from "react";
import { MovementForm } from "@/components/inventory/movement-form";
import { primaryButtonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { SelectOption } from "@/components/ui/select";
import type { FormState } from "@/lib/form-state";

export function MovementDialog({
  action,
  suppliers,
  defaultSupplierId,
  purchasePrice,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  suppliers: SelectOption[];
  defaultSupplierId: string | null;
  purchasePrice: string;
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
        Registrar movimiento
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar movimiento"
        description="Las existencias y el historial se actualizan al guardar."
        size="lg"
      >
        <MovementForm
          key={formKey}
          action={action}
          suppliers={suppliers}
          defaultSupplierId={defaultSupplierId}
          purchasePrice={purchasePrice}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
