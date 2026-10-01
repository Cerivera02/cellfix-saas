"use client";

import { useActionState, useId, useState } from "react";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { FormMessage } from "@/components/admin/form-message";
import {
  Field,
  dangerGhostButtonClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function RenameCategoryForm({
  action,
  defaultName,
  onDone,
}: {
  action: Action;
  defaultName: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prevState: FormState, formData: FormData) => {
    const result = await action(prevState, formData);
    if (result?.success) onDone();
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
          placeholder="Pantallas"
          defaultValue={state?.fields?.name ?? defaultName}
          className={inputClass}
        />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

export function CategoryActions({
  name,
  renameAction,
  deleteAction,
}: {
  name: string;
  renameAction: Action;
  deleteAction: Action;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleteState, deleteFormAction] = useActionState(deleteAction, undefined);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setFormKey((key) => key + 1);
            setOpen(true);
          }}
          className={ghostButtonClass}
        >
          Renombrar
        </button>
        <form action={deleteFormAction}>
          <ConfirmSubmitButton
            message={`¿Borrar la categoría ${name}? Sus artículos quedarán sin categoría.`}
            className={dangerGhostButtonClass}
          >
            Borrar
          </ConfirmSubmitButton>
        </form>
      </div>
      {deleteState?.message && <p className="text-xs text-red-600">{deleteState.message}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="Renombrar categoría">
        <RenameCategoryForm
          key={formKey}
          action={renameAction}
          defaultName={name}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}
